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
import type { JsonValue } from "@/lib/json";
import { exportDocx, exportPdf, type ExportFormat } from "@/export/exporter";
import { DocumentSheet } from "./DocumentSheet";
import { MicButton } from "../voice/MicButton";
import { ExportMenu } from "./ExportMenu";

/** Dictation runs in Italian only. */
const DICTATION_LANG = "it-IT";

/** Single-document app for now; a stable id so autosave survives reloads. */
const DOCUMENT_ID = "default";
const DOCUMENT_TITLE = "Documento";

/**
 * The whole application surface: the paginated document sheet + the mic button
 * (with an IT/EN switch). Owns the editor, builds the Editor Controller and the
 * dictation pipeline, autosaves every change, and gates all editing behind the
 * microphone being on.
 */
export function EditorWorkspace() {
  const editor = useEditor({
    extensions: getEditorExtensions({ placeholder: "Accendi il microfono e parla…" }),
    editable: false, // dictation-only: the page changes only from the mic
    immediatelyRender: false,
    content: "",
  });

  const pipelineRef = useRef<DictationPipeline | null>(null);
  const controllerRef = useRef<EditorController | null>(null);
  const annotationsRef = useRef<AnnotationManager>(new AnnotationManager());
  const sttProviderRef = useRef<SttProvider | null>(null);
  const sessionRef = useRef<SttSession | null>(null);
  const storeRef = useRef<LocalDocumentStore>(new LocalDocumentStore());

  const [micOn, setMicOn] = useState(false);
  const [sttState, setSttState] = useState<SttState>("idle");
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setExporting(true);
    try {
      if (format === "pdf") {
        exportPdf(DOCUMENT_TITLE);
      } else {
        await exportDocx(controller.snapshot().content, DOCUMENT_TITLE);
      }
    } finally {
      setExporting(false);
    }
  }, []);

  // Build the controller + pipeline, restore autosaved content, and autosave
  // on every change — all bound to the editor's lifetime.
  useEffect(() => {
    if (!editor) return;
    const controller = new EditorController(editor, new CheckpointStack(), {
      documentId: DOCUMENT_ID,
      title: DOCUMENT_TITLE,
    });
    controllerRef.current = controller;
    const annotationManager = annotationsRef.current;

    // Autosave content + annotations together (debounced).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const saveDoc = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        storeRef.current.save(DOCUMENT_ID, {
          title: DOCUMENT_TITLE,
          content: editor.getJSON() as JsonValue,
          annotations: annotationManager.all,
          updatedAt: new Date().toISOString(),
        });
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
      w.__clearAnnotations = () => {
        annotationManager.removeAll();
        setAnnotations([]);
      };
    }

    // Restore the autosaved document, if any.
    const persisted = storeRef.current.load(DOCUMENT_ID);
    if (persisted?.content) {
      editor.commands.setContent(persisted.content as JSONContent, false);
    }
    if (persisted?.annotations) {
      annotationManager.setAll(persisted.annotations);
      setAnnotations([...persisted.annotations]);
    }

    editor.on("update", saveDoc);

    return () => {
      editor.off("update", saveDoc);
      if (timer) clearTimeout(timer);
    };
  }, [editor, handleExport]);

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

  return (
    <div className="workspace">
      <ExportMenu onExport={handleExport} busy={exporting} />
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
