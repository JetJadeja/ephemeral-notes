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
    // Initialize empty, as requested
    EditorState.createEmpty(decorator)
  );

  // New state for persistence and UI
  const [persistentContent, setPersistentContent] = useState<string>("");
  const [title, setTitle] = useState("");
  const [isEditable, setIsEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle"); // Added save status state
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
      setSaveStatus("idle");

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
          setTitle(fetchedTitle);
          setOriginalTitle(fetchedTitle); // Store original title
          setPersistentContent(data.content || "");
          setIsEditable(data.is_editable);
          // IMPORTANT: Do NOT set editorState here, keep it empty initially
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

  // --- Save Title Logic ---
  const saveTitleToDb = async (newTitle: string) => {
    if (!documentId || !user || !isEditable || newTitle === originalTitle) {
      setIsTitleEditing(false); // Exit edit mode even if no save needed
      return; // No need to save if not editable or title hasn't changed
    }

    setSaveStatus("saving");
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("documents")
        .update({ title: newTitle })
        .eq("id", documentId)
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }
      setSaveStatus("saved");
      setOriginalTitle(newTitle); // Update original title after successful save
      setTimeout(() => setSaveStatus("idle"), 2000); // Reset status after a delay
    } catch (err: any) {
      console.error("Error saving title:", err);
      setError("Failed to save title.");
      setSaveStatus("error");
      setTitle(originalTitle); // Revert title on error
    } finally {
      setIsTitleEditing(false); // Ensure edit mode is exited
    }
  };

  // --- Editor Change Handling (with persistence update) ---
  const handleEditorChange = (newEditorState: EditorState) => {
    const currentFullText = newEditorState
      .getCurrentContent()
      .getPlainText("\n");
    // Update persistent content state immediately
    setPersistentContent(currentFullText);

    // Existing logic to update blocks map for timer
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

    // TODO LATER: Trigger debounced save for persistentContent
    // saveContentDebounced(currentFullText);
    // setSaveStatus('saving');
  };

  // --- Title Edit Handlers ---
  const handleTitleClick = () => {
    if (isEditable) {
      setOriginalTitle(title); // Store current title before editing starts
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
    setTitle(e.target.value);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent potential form submission if wrapped
      saveTitleToDb(title.trim() || "Untitled Document"); // Trim whitespace and save
    }
    if (e.key === "Escape") {
      setTitle(originalTitle); // Revert on Escape
      setIsTitleEditing(false);
    }
  };

  const handleTitleBlur = () => {
    // Save on blur only if the title has actually changed
    saveTitleToDb(title.trim() || "Untitled Document");
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
                className="text-xl font-semibold text-gray-700 p-1 border-b border-blue-500 focus:outline-none w-full text-center bg-transparent"
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                className={`text-xl font-semibold text-gray-700 truncate p-1 ${
                  isEditable ? "cursor-pointer hover:bg-gray-100 rounded" : ""
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
