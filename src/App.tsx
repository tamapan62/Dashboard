import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    window.location.replace("/dashboard.html?v=20260715-final");
  }, []);

  return (
    <main style={{ fontFamily: "Arial, Tahoma, sans-serif", padding: 24 }}>
      <a href="/dashboard.html?v=20260715-final">Open dashboard</a>
    </main>
  );
}
