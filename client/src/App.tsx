import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Dashboard/Layout'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import ReportPage from './pages/ReportPage'
import HistoryPage from './pages/HistoryPage'
import ArchitecturePage from './pages/ArchitecturePage'
import QualityPage from './pages/QualityPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="/quality" element={<QualityPage />} />
            <Route path="/report/:sessionId" element={<ReportPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </Layout>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
