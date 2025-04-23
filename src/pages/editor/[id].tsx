import {
  CharacterMetadata,
  CompositeDecorator,
  ContentBlock,
  ContentState,
  Editor,
  EditorState,
  convertToRaw,
} from "draft-js";
import "draft-js/dist/Draft.css";
import Immutable from "immutable";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext"; // Adjusted path
import { supabase } from "../../lib/supabaseClient"; // Adjusted path
import ConfirmModal from "../../components/ConfirmModal"; // Import the modal

const timeout = 120000;

// Debounce utility (for content saving later)
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

type SaveStatus = "idle" | "saving" | "saved" | "error"; // Added type for save status

function FadingSpan(props: any) {
  const [style, setStyle] = useState<any>({
    display: "inline-block",
    transition: `opacity ${timeout / 1000}s, textSize ${timeout / 1000}s`,
    textSize: "auto", // Start at normal height
  });

  useEffect(() => {
    setStyle({
      ...style,
      opacity: 0,
      textSize: 0,
    });
  }, []);

  return <span style={style}>{props.children}</span>;
}

const decorator = new CompositeDecorator([
  {
    strategy: (contentBlock, callback, contentState) => {
      const text = contentBlock.getText();
      // split the text on spaces to find words
      const words = text.split(" ");
      let length = 0;
      for (let i = 0; i < words.length; i++) {
        callback(length, length + words[i].length);
        length += words[i].length + 1;
      }
    },
    component: FadingSpan as any,
  },
]);

export default function EditorPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: documentId } = router.query; // Get document ID from route

  // Existing state for editor visuals
  const [blocks, setBlocks] = useState(new Map());
  const [editorState, setEditorState] = useState(() =>
    EditorState.createEmpty(decorator)
  );
  const [initialContent, setInitialContent] = useState<string>(""); // Added state for initial fetched content
  const [persistentContent, setPersistentContent] = useState<string>(""); // Represents combined content
  const [title, setTitle] = useState("");
  const [isEditable, setIsEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved"); // Initialize saveStatus to 'saved'
  const [isTitleEditing, setIsTitleEditing] = useState(false); // State for title edit mode
  const titleInputRef = useRef<HTMLInputElement>(null); // Ref for focusing input
  const [originalTitle, setOriginalTitle] = useState(""); // Store original title for comparison
  const [publishing, setPublishing] = useState(false); // State for publishing process
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // State for modal visibility

  // --- Data Fetching ---
  useEffect(() => {
    // Fetch document only when documentId and user are available
    if (!documentId || !user) {
      // If documentId is present but no user, might indicate loading/redirect state
      // If no documentId, it's likely still rendering
      if (documentId) setLoading(false); // Avoid showing loading if auth is the issue
      return;
    }

    const fetchDocument = async () => {
      setLoading(true);
      setError(null);
      setSaveStatus("saved");

      try {
        const { data, error: dbError } = await supabase
          .from("documents")
          .select("title, content, is_editable")
          .eq("id", documentId)
          .eq("user_id", user.id)
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") {
            throw new Error("Document not found or access denied.");
          } else {
            throw dbError;
          }
        }

        if (data) {
          // *** Check if document is editable ***
          if (!data.is_editable) {
            // If not editable (published), redirect to viewer
            console.log("Document is published. Redirecting to viewer...");
            router.replace(`/viewer/${documentId}`);
            // No need to set state further for the editor page if redirecting
            return; // Exit early
          }

          // If editable, proceed to set state for the editor
          const fetchedTitle = data.title || "Untitled Document";
          const fetchedContent = data.content || "";

          setTitle(fetchedTitle);
          setOriginalTitle(fetchedTitle);
          setInitialContent(fetchedContent); // Store fetched content separately
          setPersistentContent(fetchedContent); // Also init persistent content
          setIsEditable(data.is_editable);

          // *** Initialize editorState empty again ***
          setEditorState(EditorState.createEmpty(decorator));
        } else {
          throw new Error("Document data not found.");
        }
      } catch (err: any) {
        console.error("Error fetching document:", err);
        setError(err.message || "Failed to load document.");
      } finally {
        // Only set loading to false if not redirecting
        // setLoading(false); // setLoading handled implicitly by redirect or successful load
        // Let's ensure loading is always set to false if we didn't redirect
        if (router.asPath.startsWith("/editor/")) {
          setLoading(false);
        }
      }
    };

    fetchDocument();
    // Add user?.id to dependency array to refetch if user changes
  }, [documentId, user?.id, router]); // Added router to dependency array

  // --- Existing timer logic for visual clearing ---
  useEffect(() => {
    const timer = setInterval(() => {
      const currentTime = new Date().getTime();
      const newBlocks = new Map(blocks);
      let shouldUpdate = false;

      newBlocks.forEach((value, key) => {
        const [text, timestamp] = value;

        if (currentTime - timestamp >= timeout) {
          newBlocks.set(key, ["", timestamp]);
          shouldUpdate = true;
        }
      });

      if (shouldUpdate) {
        const newContentState = ContentState.createFromBlockArray(
          Array.from(
            newBlocks,
            ([key, [text]]) =>
              new ContentBlock({
                key: key,
                type: "unstyled",
                text: text,
                characterList: Immutable.List(
                  Array(text.length).fill(CharacterMetadata.create())
                ),
              })
          )
        );
        // This push updates the VISUAL editor state based on the timer
        const newEditorState = EditorState.push(
          editorState,
          newContentState,
          "change-block-data"
        );
        setEditorState(newEditorState);
        setBlocks(newBlocks);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [blocks, editorState]);

  // --- Unified Debounced Save Logic ---
  const saveDocumentDebounced = useCallback(
    debounce(async (contentToSave: string, titleToSave: string) => {
      if (!documentId || !user || !isEditable) return;
      setSaveStatus("saving");
      setError(null);
      try {
        console.log("Saving document (combined):", {
          title: titleToSave,
          content: "...",
        });
        const { error: updateError } = await supabase
          .from("documents")
          .update({
            content: contentToSave, // Save the combined content
            title: titleToSave.trim() || "Untitled Document",
          })
          .eq("id", documentId)
          .eq("user_id", user.id);

        if (updateError) {
          throw updateError;
        }
        setSaveStatus("saved");
        setOriginalTitle(titleToSave.trim() || "Untitled Document");
      } catch (err: any) {
        console.error("Error saving document:", err);
        setError("Failed to save document.");
        setSaveStatus("error");
      }
    }, 500), // Reduced debounce delay to 500ms (0.5 seconds)
    [documentId, user, isEditable] // Dependencies
  );

  // --- Editor Change Handling ---
  const handleEditorChange = (newEditorState: EditorState) => {
    // 1. Update visual editor state and timer map
    const newBlocksMap = new Map();
    const currentTime = new Date().getTime();
    newEditorState
      .getCurrentContent()
      .getBlocksAsArray()
      .forEach((block) => {
        const oldBlockValue = blocks.get(block.getKey());
        const newText = block.getText();
        if (oldBlockValue) {
          const [oldText] = oldBlockValue;
          if (oldText === newText) {
            newBlocksMap.set(block.getKey(), oldBlockValue);
          } else {
            newBlocksMap.set(block.getKey(), [newText, currentTime]);
          }
        } else {
          newBlocksMap.set(block.getKey(), [newText, currentTime]);
        }
      });
    setBlocks(newBlocksMap);
    setEditorState(newEditorState); // Update visual state

    // 2. Get text currently visible in the editor
    const currentVisualText = newEditorState
      .getCurrentContent()
      .getPlainText("\n");

    // 3. Combine initial content with current visual text, adding a newline if needed
    let combinedContent = "";
    if (initialContent !== "" && currentVisualText !== "") {
      // Add newline only if initial content exists and visual text is being added
      combinedContent = initialContent + "\n" + currentVisualText;
    } else {
      // Handle cases where either initial or visual is empty
      combinedContent = initialContent + currentVisualText;
    }

    // 4. Update persistent state (tracks the full intended content)
    setPersistentContent(combinedContent);

    // 5. Check if content has changed and update status immediately if needed
    if (
      isEditable &&
      combinedContent !== initialContent &&
      saveStatus === "saved"
    ) {
      setSaveStatus("saving"); // Show saving immediately on change
    }

    // 6. Trigger debounced save with the combined content
    if (isEditable) {
      saveDocumentDebounced(combinedContent, title); // Pass current title state
    }
  };

  // --- Title Edit Handlers ---
  const handleTitleClick = () => {
    if (isEditable) {
      // Set original title state when starting edit
      setOriginalTitle(title);
      setIsTitleEditing(true);
    }
  };

  useEffect(() => {
    // Focus the input when title editing mode starts
    if (isTitleEditing) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select(); // Select text for easy replacement
    }
  }, [isTitleEditing]);

  const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    // Trigger save with current PERSISTENT content and new title
    if (isEditable) {
      // Use persistentContent state here as it reflects the latest intended combo
      saveDocumentDebounced(persistentContent, newTitle);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // No need to explicitly save, just blur to exit edit mode
      titleInputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setTitle(originalTitle); // Revert to original title on Escape
      setIsTitleEditing(false);
    }
  };

  const handleTitleBlur = () => {
    // Simply exit edit mode. Debounce handles the save.
    // Trim title just before exiting edit mode for display consistency
    setTitle((prev) => prev.trim() || "Untitled Document");
    setIsTitleEditing(false);
    // Optional: trigger one last save explicitly? Usually debounce is enough.
    // if (isEditable) { saveDocumentDebounced(persistentContent, title.trim() || "Untitled Document"); }
  };

  // --- Modified Publish Handler: Opens Modal ---
  const handlePublish = () => {
    // Don't open modal if already publishing or saving
    if (!isEditable || publishing || saveStatus === "saving") return;
    setIsConfirmModalOpen(true); // Open the confirmation modal
  };

  // --- Actual Publish Logic (called by Modal) ---
  const confirmPublishAction = async () => {
    setIsConfirmModalOpen(false); // Close modal first
    if (!documentId || !user || !isEditable || publishing) return;

    setPublishing(true);
    setError(null); // Clear previous errors

    try {
      console.log("Publishing document:", documentId);
      const { error: updateError } = await supabase
        .from("documents")
        .update({ is_editable: false })
        .eq("id", documentId)
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }

      setIsEditable(false); // Update local state immediately
      console.log("Document published successfully.");
      // Optional: Could redirect here: router.push(`/viewer/${documentId}`);
      // For now, we just disable editing.
    } catch (err: any) {
      console.error("Error publishing document:", err);
      setError("Failed to publish document.");
      // Optionally reset saveStatus or show a specific publish error state
    } finally {
      setPublishing(false);
    }
  };

  const cancelPublishAction = () => {
    setIsConfirmModalOpen(false);
  };

  // --- UI Rendering with Loading/Error States ---
  if (loading) {
    return <div className="p-8 text-center">Loading document...</div>;
  }

  if (error && !isTitleEditing) {
    return (
      <div className="p-8 text-red-600 text-center">
        <p>Error: {error}</p>
        <Link href="/dashboard" legacyBehavior>
          <a className="text-blue-500 hover:underline">Back to Dashboard</a>
        </Link>
      </div>
    );
  }

  // Cast Editor to any to bypass JSX component type checking
  const DraftEditor = Editor as any;

  const showHiddenContentNotification =
    !loading &&
    initialContent &&
    editorState.getCurrentContent().getPlainText("").length === 0;

  return (
    // Added min-h-screen to ensure layout fills height
    <div className="w-full items-center justify-between p-8 md:p-12 min-h-screen flex flex-col">
      {/* Centered content area */}
      <div className="w-full max-w-[800px] mx-auto flex-grow flex flex-col">
        {/* Simple Header: Back Button and Title (Title Input later) */}
        <div className="flex justify-between items-center mb-4">
          <Link href="/dashboard" legacyBehavior>
            <a className="text-blue-500 hover:underline">&larr; Dashboard</a>
          </Link>
          {/* Title Display/Input Area */}
          <div className="flex-grow mx-4 text-center">
            {isTitleEditing ? (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={handleTitleInputChange}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleBlur}
                className="text-xl font-semibold text-gray-700 p-1 border-b border-blue-500 focus:outline-none w-auto inline-block text-center bg-transparent"
                size={Math.max(10, title.length || 15)}
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                className={`text-xl font-semibold text-gray-700 truncate p-1 ${
                  isEditable ? "cursor-pointer" : ""
                }`}
                title={isEditable ? "Click to edit title" : title}
              >
                {title}
              </h1>
            )}
          </div>
          {/* Status and Actions Area */}
          <div className="flex items-center min-w-[200px] justify-end gap-4">
            {" "}
            {/* Increased min-width and added gap */}
            <span className="text-sm text-gray-500">
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && !publishing && "Saved"}
              {saveStatus === "error" && error && "Save Error"}
              {publishing && "Publishing..."}
            </span>
            {/* Publish Button - Now triggers modal */}
            {isEditable && (
              <button
                onClick={handlePublish} // Opens the modal
                disabled={publishing || saveStatus === "saving"}
                className={`px-3 py-1 text-sm rounded ${
                  publishing || saveStatus === "saving"
                    ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            )}
          </div>
        </div>

        {/* Hidden Content Notification */}
        {showHiddenContentNotification && (
          <div className="text-center text-sm text-gray-500 mb-2 p-2 bg-gray-100 rounded">
            Previously saved content is hidden. Continue typing to add to it.
          </div>
        )}

        {/* Editor Area - Removed border */}
        <div
          className={`flex-grow rounded p-4 ${
            !isEditable ? "bg-gray-100 opacity-70" : "bg-white"
          }`}
        >
          <DraftEditor
            editorState={editorState}
            onChange={handleEditorChange}
            placeholder={
              isEditable ? "Start writing..." : "This document is read-only."
            }
            readOnly={!isEditable}
          />
        </div>

        {/* Removed original header text */}
        {/* <div className="flex flex-row items-center justify-between w-full">
          <p className="text-black opacity-60 mb-2.5 font-semibold">
            Ephemeral Notes
          </p>
          <p className="text-black opacity-60 mb-2.5 font-light text-sm">60s</p>
        </div> */}
      </div>

      {/* --- Confirmation Modal --- */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={cancelPublishAction}
        onConfirm={confirmPublishAction}
        title="Publish Document?"
        message={
          <p>
            Publishing this document will make it publicly viewable and
            <strong className="font-semibold">
              {" "}
              permanently disable editing
            </strong>
            . Are you sure you want to proceed?
          </p>
        }
        confirmButtonText="Publish"
        cancelButtonText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700" // Ensure red button style
      />
    </div>
  );
}
