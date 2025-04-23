import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/react";
import type { AppProps as NextAppProps } from "next/app";
import Head from "next/head";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { JetBrains_Mono } from "next/font/google";

// Define simplified AppProps type without router
type AppProps = Omit<NextAppProps, "router">;

const jetbrains = JetBrains_Mono({ subsets: ["latin"] });

// Define public, auth, and protected routes
const publicRoutes = ["/"]; // Add any other public routes
const authRoutes = ["/auth"];
const protectedRoutes = ["/dashboard", "/editor"]; // Add base paths for protected areas

function AppContent({ Component, pageProps }: AppProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Don't redirect until loading is complete

    const isAuthRoute = authRoutes.includes(router.pathname);
    // Check if current path starts with any protected route base path
    const isProtectedRoute = protectedRoutes.some((route) =>
      router.pathname.startsWith(route)
    );

    if (!user && isProtectedRoute) {
      // If not logged in and trying to access protected route, redirect to auth
      router.push("/auth");
    } else if (user && isAuthRoute) {
      // If logged in and trying to access auth route, redirect to dashboard
      router.push("/dashboard");
    }
    // If logged in and accessing protected route, or any user accessing public route, allow access
  }, [user, loading, router]);

  // Potentially show a loading spinner while checking auth state or during redirect
  // For now, relying on AuthProvider's loading state and quick redirects

  // Render the component if access is allowed based on checks
  // Note: AuthProvider already prevents rendering children during initial load
  return <Component {...pageProps} />;
}

export default function App({ Component, pageProps }: NextAppProps) {
  return (
    <AuthProvider>
      <Head>
        <title>Ephemeral Notes</title>
        <meta
          name="description"
          content="Impermanent thoughts, impermanent notes."
        />
        <meta property="og:title" content="Ephemeral Notes" />
        <meta
          property="og:description"
          content="Impermanent thoughts, impermanent notes."
        />
        <meta property="og:url" content="https://ephemeral-notes.com" />
        <meta property="og:site_name" content="Ephemeral Notes" />
        <meta
          property="og:image"
          content="https://ephemeral-notes.com/static/OpenGraphEphemeral.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="en-US" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ephemeral Notes" />
        <meta
          name="twitter:description"
          content="Impermanent thoughts, impermanent notes."
        />
        <meta name="twitter:site" content="@willdepue" />
        <meta name="twitter:site:id" content="998575387067142144" />
        <meta
          name="twitter:image"
          content="https://ephemeral-notes.com/static/OpenGraphEphemeral.png"
        />
      </Head>
      <main className={jetbrains.className}>
        <AppContent Component={Component} pageProps={pageProps} />
      </main>
      <Analytics />
    </AuthProvider>
  );
}
