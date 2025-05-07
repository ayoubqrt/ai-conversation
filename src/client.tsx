import "./styles.css";
import { createRoot } from "react-dom/client";

import { useState, Suspense, lazy } from "react";

const App = lazy(() => import("./app"));

const Launch = () => {
  const [isClicked, setIsClicked] = useState(false);

  return (
    <div>
      {!isClicked && (
        <button onClick={() => setIsClicked(true)}>Lancer la discussion</button>
      )}
      {isClicked && (
        <Suspense fallback={<div>Loading...</div>}>
          <App />
        </Suspense>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("app")!);

root.render(
  <div className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100">
    <Launch />
  </div>
);
