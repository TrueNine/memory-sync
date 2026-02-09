import type { FC } from 'react'

import { HashRouter, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import { useTheme } from './hooks/useTheme'
import { I18nContext, useI18nState } from './i18n'
import ConfigPage from './pages/ConfigPage'
import DashboardPage from './pages/DashboardPage'
import LogsPage from './pages/LogsPage'
import PipelinePage from './pages/PipelinePage'
import PluginsPage from './pages/PluginsPage'
import SettingsPage from './pages/SettingsPage'

const App: FC = () => {
  const i18n = useI18nState()
  useTheme()

  return (
    <I18nContext.Provider value={i18n}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="config" element={<ConfigPage />} />
            <Route path="plugins" element={<PluginsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </I18nContext.Provider>
  )
}

export default App
