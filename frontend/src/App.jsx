import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Overview from "./pages/Overview.jsx";
import Inventory from "./pages/Inventory.jsx";
import Incidents from "./pages/Incidents.jsx";
import IncidentDetail from "./pages/IncidentDetail.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}