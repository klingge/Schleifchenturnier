import { Navigate, Route, Routes } from "react-router-dom";
import { AdminArea } from "@/features/access/AdminArea";
import { PublicEvent } from "@/features/public/PublicEvent";

export default function App() {
  return (
    <Routes>
      <Route path="/event/:slug" element={<PublicEvent />} />
      <Route path="/admin/*" element={<AdminArea />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
