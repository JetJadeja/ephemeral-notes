import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import ConfirmModal from "../components/ConfirmModal";

type Document = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_editable: boolean;
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user) return; // Should not happen due to route protection, but good practice

      setLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from("documents")
          .select("id, title, created_at, updated_at, is_editable")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (dbError) {
          throw dbError;
        }

        setDocuments(data || []);
      } catch (err: any) {
        console.error("Error fetching documents:", err);
        setError(err.message || "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [user]); // Re-fetch if user changes (e.g., logout/login)

  const handleCreateDocument = async () => {
    if (!user) return;
    setLoading(true); // Use loading state for creation as well
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("documents")
        .insert([{ user_id: user.id, title: "Untitled Document" }]) // Use default title from schema
        .select("id") // Only select the ID of the new document
        .single(); // Expecting a single record back

      if (insertError) {
        throw insertError;
      }

      if (data?.id) {
        router.push(`/editor/${data.id}`);
      } else {
        throw new Error("Failed to create document or retrieve ID.");
      }
    } catch (err: any) {
      console.error("Error creating document:", err);
      setError(err.message || "Failed to create new document.");
      setLoading(false); // Stop loading on error
    }
    // setLoading(false) will be handled implicitly by navigation on success
  };

  const handleDeleteClick = (docId: string) => {
    setDeletingDocId(docId);
    setIsConfirmModalOpen(true);
  };

  const confirmDeleteAction = async () => {
    if (!deletingDocId || !user) return;

    setIsConfirmModalOpen(false);
    setError(null);

    try {
      console.log("Deleting document:", deletingDocId);
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", deletingDocId)
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      setDocuments((prevDocs) =>
        prevDocs.filter((doc) => doc.id !== deletingDocId)
      );
      console.log("Document deleted successfully.");
    } catch (err: any) {
      console.error("Error deleting document:", err);
      setError(err.message || "Failed to delete document.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const cancelDeleteAction = () => {
    setDeletingDocId(null);
    setIsConfirmModalOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    // The AuthProvider listener in _app.tsx will handle redirecting to /auth
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold text-gray-800">Transient</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleCreateDocument}
              disabled={loading}
              className="px-5 py-2 font-semibold text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "+ New Document"}
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Log Out
            </button>
          </div>
        </header>

        {error && <p className="mb-4 text-red-600">Error: {error}</p>}

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul role="list" className="divide-y divide-gray-200">
            {loading && documents.length === 0 && (
              <li className="px-6 py-4 text-center text-gray-500">
                Loading documents...
              </li>
            )}
            {!loading && documents.length === 0 && (
              <li className="px-6 py-4 text-center text-gray-500">
                No documents yet. Create one to get started!
              </li>
            )}
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex justify-between items-center hover:bg-gray-50"
              >
                <Link
                  href={
                    doc.is_editable ? `/editor/${doc.id}` : `/viewer/${doc.id}`
                  }
                  legacyBehavior
                >
                  <a className="flex-grow block px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-medium text-indigo-600 truncate">
                          {doc.title}
                        </p>
                        <p className="text-sm text-gray-500">
                          Last updated:{" "}
                          {new Date(doc.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        {!doc.is_editable && (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            Published
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                </Link>
                <div className="px-4 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      handleDeleteClick(doc.id);
                    }}
                    title="Delete document"
                    className="p-1 text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded-full"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={cancelDeleteAction}
        onConfirm={confirmDeleteAction}
        title="Delete Document?"
        message={
          <p>
            Are you sure you want to delete this document?
            <strong className="font-semibold block mt-1 text-red-700">
              This action cannot be undone.
            </strong>
          </p>
        }
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  );
}
