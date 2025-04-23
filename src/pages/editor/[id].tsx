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
        setLoading(false);
      }
    };

    fetchDocument();
    // Add user?.id to dependency array to refetch if user changes
  }, [documentId, user?.id]);

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

      // Prevent saving if title hasn't actually changed from the last saved state
      // Note: This assumes fetchDocument sets originalTitle correctly initially
      // We might need a different check if saves happen frequently
      // For now, we save both fields regardless on trigger

      setSaveStatus("saving");
      setError(null); // Clear previous errors on new save attempt

      try {
        console.log("Saving document (combined):", {
          title: titleToSave,
          content: "...",
        });
        const { error: updateError } = await supabase
          .from("documents")
          .update({
            content: contentToSave,
            title: titleToSave.trim() || "Untitled Document", // Ensure title isn't empty
          })
          .eq("id", documentId)
          .eq("user_id", user.id);

        if (updateError) {
          throw updateError;
        }
        setSaveStatus("saved");
        // Update originalTitle here to reflect the last successful save
        setOriginalTitle(titleToSave.trim() || "Untitled Document");
        // Update initialContent to reflect the newly saved state
        setInitialContent(contentToSave);
      } catch (err: any) {
        console.error("Error saving document:", err);
        setError("Failed to save document.");
        setSaveStatus("error");
        // Consider reverting title/content on error? Maybe too aggressive.
      }
    }, 1500), // Debounce delay of 1.5 seconds
    [documentId, user, isEditable] // Dependencies for useCallback
  );

  // --- Editor Change Handling (with persistence update) ---
  const handleEditorChange = (newEditorState: EditorState) => {
    // Update visual editor state and timer map
    const newBlocks = new Map();
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
            newBlocks.set(block.getKey(), oldBlockValue);
          } else {
            newBlocks.set(block.getKey(), [newText, currentTime]);
          }
        } else {
          newBlocks.set(block.getKey(), [newText, currentTime]);
        }
      });
    setBlocks(newBlocks);
    setEditorState(newEditorState);

    // Get text currently visible in the editor
    const currentVisualText = newEditorState
      .getCurrentContent()
      .getPlainText("\n");

    // Combine initial content with current visual text for saving
    const combinedContent = initialContent + currentVisualText;

    // Update persistent state (optional, but good for consistency)
    setPersistentContent(combinedContent);

    // Trigger unified debounced save with combined content
    if (isEditable) {
      saveDocumentDebounced(combinedContent, title);
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
          <div className="flex items-center min-w-[150px] justify-end">
            {" "}
            {/* Added min-width */}
            <span className="text-sm text-gray-500 mr-4">
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && "Saved"}
              {/* Show general error only if not related to title edit */}
              {saveStatus === "error" && error && "Save Error"}
            </span>
            {/* TODO LATER: Add Publish Button */}
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
    </div>
  );
}
