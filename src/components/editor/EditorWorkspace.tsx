"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "@/editor/tiptap-config";
import { EditorController } from "@/editor/editor-controller";
import { CheckpointStack } from "@/core/document/versioning";
import {
  ConversationManager,
  TurnQueue,
} from "@/core/conversation/conversation-manager";
import { ContextManager } from "@/core/context/context-manager";
import {
  AnnotationManager,
  type Annotation,
} from "@/core/annotations/annotation-manager";
import { DictationPipeline } from "@/client/dictation-pipeline";
import { WebSpeechSttProvider } from "@/speech/web-speech-stt";
import type { SttProvider, SttSession, SttState } from "@/speech/types";
import { LocalDocumentStore } from "@/storage/local-document-store";
import { createDocumentStore } from "@/storage/create-store";
import type {
  DocumentPersistence,
  DocumentVersionMeta,
  PersistedDocument,
} from "@/storage/document-persistence";
import { isSupabaseConfigured } from "@/storage/supabase/config";
import {
  getCurrentUser,
  onAuthStateChange,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type AuthUser,
} from "@/auth/auth";
import { exportDocx, exportPdf, type ExportFormat } from "@/export/exporter";
import { DocumentSheet } from "./DocumentSheet";
import { MicButton } from "../voice/MicButton";
import { ExportMenu } from "./ExportMenu";
import { VersionsMenu } from "./VersionsMenu";
import { AuthBar } from "./AuthBar";

/** Dictation runs in Italian only. */
const DICTATION_LANG = "it-IT";
const DOCUMENT_ID = "default";
const DOCUMENT_TITLE = "Documento";

function defaultVersionLabel(): string {
  return `Versione del ${new Date().toLocaleString("it-IT")}`;
}

/**
 * The whole application surface: document sheet + mic button, plus small export,
 * versions, and auth controls. Owns the editor, the dictation pipeline, autosave
 * (local or Supabase), and version history. Runs fully in local mode when
 * Supabase is not configured.
 */
export function EditorWorkspace() {
  const editor = useEditor({
    extensions: getEditorExtensions({ placeholder: "Accendi il microfono e parla…" }),
    editable: false, // dictation-only: the page changes only from the mic
    immediatelyRender: false,
    content: "",
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  const pipelineRef = useRef<DictationPipeline | null>(null);
  const controllerRef = useRef<EditorController | null>(null);
  const annotationsRef = useRef<AnnotationManager>(new AnnotationManager());
  const storeRef = useRef<DocumentPersistence>(new LocalDocumentStore());
  const sttProviderRef = useRef<SttProvider | null>(null);
  const sessionRef = useRef<SttSession | null>(null);

  const [micOn, setMicOn] = useState(false);
  const [sttState, setSttState] = useState<SttState>("idle");
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [versions, setVersions] = useState<DocumentVersionMeta[]>([]);
  const [storeLabel, setStoreLabel] = useState("Locale");
  const [user, setUser] = useState<AuthUser | null>(null);
  const supaConfigured = useRef(isSupabaseConfigured()).current;

  /* ── Document snapshot + persistence helpers ─────────────────────────── */

  const currentPersisted = useCallback((): PersistedDocument | null => {
    const controller = controllerRef.current;
    if (!controller) return null;
    const snapshot = controller.snapshot();
    return {
      title: snapshot.title,
      content: snapshot.content,
      annotations: annotationsRef.current.all,
      updatedAt: snapshot.updatedAt,
    };
  }, []);

  const refreshVersions = useCallback(async () => {
    setVersions(await storeRef.current.listVersions(DOCUMENT_ID));
  }, []);

  const handleSaveVersion = useCallback(
    async (label?: string) => {
      const doc = currentPersisted();
      if (!doc) return;
      await storeRef.current.saveVersion(
        DOCUMENT_ID,
        label?.trim() || defaultVersionLabel(),
        doc,
      );
      await refreshVersions();
    },
    [currentPersisted, refreshVersions],
  );

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    const restored = await storeRef.current.loadVersion(DOCUMENT_ID, versionId);
    const ed = editorRef.current;
    if (!restored || !ed) return;
    ed.commands.setContent(restored.content as JSONContent, false);
    annotationsRef.current.setAll(restored.annotations ?? []);
    setAnnotations([...annotationsRef.current.all]);
  }, []);

  const handleExport = useCallback(async (format: ExportFormat) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setExporting(true);
    try {
      if (format === "pdf") exportPdf(DOCUMENT_TITLE);
      else await exportDocx(controller.snapshot().content, DOCUMENT_TITLE);
    } finally {
      setExporting(false);
    }
  }, []);

  /* ── Editor lifecycle: controller, pipeline, restore, autosave ───────── */

  useEffect(() => {
    if (!editor) return;
    let disposed = false;

    const controller = new EditorController(editor, new CheckpointStack(), {
      documentId: DOCUMENT_ID,
      title: DOCUMENT_TITLE,
    });
    controllerRef.current = controller;
    const annotationManager = annotationsRef.current;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const saveDoc = () => {
      const doc = currentPersisted();
      if (!doc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void storeRef.current.save(DOCUMENT_ID, doc);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1400);
      }, 350);
    };

    pipelineRef.current = new DictationPipeline(
      controller,
      new ConversationManager(),
      new ContextManager(),
      new TurnQueue(),
      annotationManager,
      {
        onProcessingChange: setProcessing,
        onExport: (f) => void handleExport(f),
        onSaveVersion: (label) => void handleSaveVersion(label),
        onRestoreVersion: (id) => void handleRestoreVersion(id),
        onAnnotationsChanged: () => {
          setAnnotations([...annotationManager.all]);
          saveDoc();
        },
      },
    );

    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as Record<string, unknown>;
      w.__editorController = controller;
      w.__annotate = (spec: Omit<Annotation, "id">) => {
        annotationManager.add(spec);
        if (spec.direction === "down") {
          controller.ensureArrowSpaceAfter(spec.blockId, spec.sizePx + 14);
        }
        setAnnotations([...annotationManager.all]);
      };
    }

    // Resolve the persistence backend (Supabase if signed in, else local),
    // then restore the document and its versions.
    void (async () => {
      const store = await createDocumentStore();
      if (disposed) return;
      storeRef.current = store;
      setStoreLabel(store.label);
      const persisted = await store.load(DOCUMENT_ID);
      if (!disposed && persisted) {
        if (persisted.content) {
          editor.commands.setContent(persisted.content as JSONContent, false);
        }
        if (persisted.annotations) {
          annotationManager.setAll(persisted.annotations);
          setAnnotations([...persisted.annotations]);
        }
      }
      if (!disposed) await refreshVersions();
    })();

    editor.on("update", saveDoc);
    return () => {
      disposed = true;
      editor.off("update", saveDoc);
      if (timer) clearTimeout(timer);
    };
  }, [editor, currentPersisted, handleExport, handleSaveVersion, handleRestoreVersion, refreshVersions]);

  /* ── Auth ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!supaConfigured) return;
    void getCurrentUser().then(setUser);
    const unsubscribe = onAuthStateChange(async (nextUser) => {
      setUser(nextUser);
      storeRef.current = await createDocumentStore();
      setStoreLabel(storeRef.current.label);
      await refreshVersions();
    });
    return unsubscribe;
  }, [supaConfigured, refreshVersions]);

  /* ── Speech ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const provider = new WebSpeechSttProvider();
    sttProviderRef.current = provider;
    setSupported(provider.isSupported);
    return () => sessionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const provider = sttProviderRef.current;
    if (!provider || !provider.isSupported) return;
    const session = provider.createSession(
      { lang: DICTATION_LANG },
      {
        onInterim: (text) => setInterim(text),
        onFinal: (text) => {
          setInterim("");
          void pipelineRef.current?.submit(text);
        },
        onStateChange: setSttState,
        onError: () => setSttState("error"),
      },
    );
    sessionRef.current = session;
    session.start();
    setMicOn(true);
  }, []);

  const stopListening = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setMicOn(false);
    setSttState("idle");
    setInterim("");
  }, []);

  const toggleMic = useCallback(() => {
    if (micOn) stopListening();
    else startListening();
  }, [micOn, startListening, stopListening]);

  const handleSignOut = useCallback(() => void signOut(), []);

  return (
    <div className="workspace">
      <AuthBar
        configured={supaConfigured}
        user={user}
        onSignIn={signInWithPassword}
        onSignUp={signUpWithPassword}
        onSignOut={handleSignOut}
      />
      <div className="top-right-controls">
        <VersionsMenu
          versions={versions}
          storeLabel={storeLabel}
          onSave={(label) => void handleSaveVersion(label)}
          onRestore={(id) => void handleRestoreVersion(id)}
        />
        <ExportMenu onExport={handleExport} busy={exporting} />
      </div>
      <DocumentSheet editor={editor} annotations={annotations} />
      <MicButton
        on={micOn}
        supported={supported}
        processing={processing}
        state={sttState}
        interim={interim}
        saved={saved}
        onToggle={toggleMic}
      />
    </div>
  );
}
