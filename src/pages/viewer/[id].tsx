import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient"; // Adjusted path
import { useAuth } from "../../context/AuthContext"; // Still useful for conditional back button

export default function ViewerPage() {
  const router = useRouter();
  const { user } = useAuth(); // Get user state for potential conditional UI
  const { id: documentId } = router.query; // Get document ID from route

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    if (!documentId) {
      // Wait for router query to be ready
      return;
    }

    const fetchDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from("documents")
          .select("title, content, is_editable")
          .eq("id", documentId)
          // No filter on is_editable here, fetch regardless
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") {
            // Code for 'Not Found'
            throw new Error("Document not found."); // Changed error message slightly
          } else {
            throw dbError;
          }
        }

        if (data) {
          // *** Check if document is editable ***
          if (data.is_editable === true) {
            // If editable, redirect to the editor page
            console.log("Document is not published. Redirecting to editor...");
            router.replace(`/editor/${documentId}`);
            // No need to set state further for viewer page if redirecting
            return; // Exit early
          }

          // If not editable (published), proceed to set state for the viewer
          setTitle(data.title || "Untitled Document");
          setContent(data.content || "");
        } else {
          // Should be caught by dbError check, but as a fallback
          throw new Error("Document data could not be retrieved.");
        }
      } catch (err: any) {
        console.error("Error fetching document for viewer:", err);
        setError(err.message || "Failed to load document.");
      } finally {
        // Only set loading to false if not redirecting
        if (router.asPath.startsWith("/viewer/")) {
          setLoading(false);
        }
      }
    };

    fetchDocument();
  }, [documentId, router]); // Added router to dependency array

  // --- UI Rendering ---
  if (loading) {
    return <div className="p-8 text-center">Loading document...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-red-600 text-center">
        <p>Error: {error}</p>
        {/* Optionally provide a link back */}
        <Link href="/" legacyBehavior>
          <a className="text-blue-500 hover:underline">Go Home</a>
        </Link>
        {user && (
          <Link href="/dashboard" legacyBehavior>
            <a className="ml-4 text-blue-500 hover:underline">
              Go to Dashboard
            </a>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="w-full items-center justify-between p-8 md:p-12 min-h-screen flex flex-col">
      {/* Centered content area */}
      <div className="w-full max-w-[800px] mx-auto flex-grow flex flex-col">
        {/* Header: Back Button (conditional) and Title */}
        <div className="flex justify-between items-center mb-4">
          {user ? (
            <Link href="/dashboard" legacyBehavior>
              <a className="text-blue-500 hover:underline w-[80px] block">
                &larr; Dashboard
              </a>
            </Link>
          ) : (
            <span className="w-[80px]" aria-hidden="true">
              &nbsp;
            </span>
          )}
          {/* Title Display Area */}
          <div className="flex-grow mx-4 text-center">
            <h1 className="text-xl font-semibold text-gray-700 truncate p-1">
              {title}
            </h1>
          </div>
          <span className="w-[80px]" aria-hidden="true">
            &nbsp;
          </span>
        </div>

        {/* Read-only Content Area */}
        <div className="flex-grow rounded p-4 bg-white whitespace-pre-wrap break-words overflow-auto text-gray-800">
          {/* whitespace-pre-wrap preserves whitespace and wraps text */}
          {/* break-words helps prevent long unbroken strings from overflowing */}
          {content}
        </div>
      </div>
    </div>
  );
}
