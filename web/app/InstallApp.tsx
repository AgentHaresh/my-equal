"use client";

import { useEffect } from "react";

/** Registers the service worker that makes My Equal installable as an app. Shows nothing. */
export default function InstallApp() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
