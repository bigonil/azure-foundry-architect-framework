"""
Pricing Calculator — queries Azure Retail Pricing API for cost estimates.
Used by the CostOptimizerAgent for pre-calculations before LLM analysis.
"""
import logging
from functools import lru_cache

import httpx

logger = logging.getLogger(__name__)

AZURE_PRICING_API = "https://prices.azure.com/api/retail/prices"

# Rough monthly cost estimates (USD) for common Azure services
# Used as fallback when API is not available
FALLBACK_ESTIMATES: dict[str, float] = {
    # Compute
    "Azure Virtual Machines": 150.0,
    "Azure Kubernetes Service": 0.0,       # Free cluster management
    "Azure Container Apps": 25.0,
    "Azure Functions": 5.0,               # Consumption plan
    "Azure App Service": 55.0,            # B2 plan
    # Storage
    "Azure Blob Storage": 20.0,
    "Azure Files": 15.0,
    "Azure Managed Disks": 40.0,
    # Databases
    "Azure Database for PostgreSQL": 100.0,
    "Azure Database for MySQL": 80.0,
    "Azure SQL Database": 150.0,
    "Azure Cosmos DB": 50.0,
    "Azure Cache for Redis": 55.0,
    # Networking
    "Azure Application Gateway": 130.0,
    "Azure Load Balancer": 20.0,
    "Azure Front Door": 35.0,
    # Messaging
    "Azure Service Bus": 10.0,
    "Azure Event Hubs": 22.0,
    "Azure Event Grid": 1.0,
    # Security
    "Azure Key Vault": 5.0,
    "Microsoft Defender for Cloud": 15.0,
}


class PricingCalculator:
    """Azure pricing estimation utility."""

    def estimate_monthly_cost(
        self,
        service_name: str,
        sku_name: str = "",
        region: str = "westeurope",
    ) -> float:
        """Return estimated monthly cost in USD for a service."""
        try:
            return self._query_azure_pricing_api(service_name, sku_name, region)
        except Exception as e:
            logger.debug(f"Azure Pricing API unavailable, using fallback: {e}")
            return self._fallback_estimate(service_name)

    def _query_azure_pricing_api(
        self, service_name: str, sku_name: str, region: str
    ) -> float:
        """Query the Azure Retail Pricing API (no auth required)."""
        filter_parts = [f"armRegionName eq '{region}'"]
        if sku_name:
            filter_parts.append(f"contains(skuName, '{sku_name}')")
        filter_parts.append(f"contains(productName, '{service_name}')")
        filter_parts.append("priceType eq 'Consumption'")

        params = {
            "$filter": " and ".join(filter_parts),
            "$top": "5",
        }

        with httpx.Client(timeout=5.0) as client:
            resp = client.get(AZURE_PRICING_API, params=params)
            resp.raise_for_status()
            data = resp.json()

        items = data.get("Items", [])
        if not items:
            return self._fallback_estimate(service_name)

        # Return the median retail price * estimated 730 hours/month
        prices = [item.get("retailPrice", 0.0) for item in items]
        median_hourly = sorted(prices)[len(prices) // 2]
        return round(median_hourly * 730, 2)

    def _fallback_estimate(self, service_name: str) -> float:
        """Fallback to static estimates when API is unavailable."""
        for key, value in FALLBACK_ESTIMATES.items():
            if key.lower() in service_name.lower() or service_name.lower() in key.lower():
                return value
        return 50.0  # Generic fallback

    @lru_cache(maxsize=128)
    def get_vm_monthly_cost(self, vm_size: str, region: str = "westeurope") -> float:
        """Get monthly cost for a specific Azure VM size."""
        try:
            params = {
                "$filter": (
                    f"armSkuName eq '{vm_size}' and "
                    f"armRegionName eq '{region}' and "
                    "priceType eq 'Consumption' and "
                    "contains(productName, 'Virtual Machines')"
                ),
                "$top": "1",
            }
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(AZURE_PRICING_API, params=params)
                resp.raise_for_status()
                items = resp.json().get("Items", [])
            if items:
                return round(items[0].get("retailPrice", 0.0) * 730, 2)
        except Exception as e:
            logger.debug(f"VM pricing lookup failed: {e}")
        return 150.0

    def calculate_reserved_savings(
        self, monthly_cost: float, term_years: int = 1
    ) -> dict[str, float]:
        """Calculate Reserved Instance savings (approximate)."""
        discounts = {1: 0.35, 3: 0.55}  # ~35% for 1yr, ~55% for 3yr
        discount = discounts.get(term_years, 0.35)
        reserved_monthly = monthly_cost * (1 - discount)
        return {
            "on_demand_monthly_usd": monthly_cost,
            "reserved_monthly_usd": round(reserved_monthly, 2),
            "monthly_savings_usd": round(monthly_cost - reserved_monthly, 2),
            "annual_savings_usd": round((monthly_cost - reserved_monthly) * 12, 2),
            "term_years": term_years,
            "discount_percentage": int(discount * 100),
        }
