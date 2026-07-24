"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import { getEditorExtensions } from "@/editor/tiptap-config";
import { EditorController } from "@/editor/editor-controller";
import { CheckpointStack } from "@/core/document/versioning";
import {
  ConversationManager,
  TurnQueue,
} from "@/core/conversation/conversation-manager";
import { ContextManager } from "@/core/context/context-manager";
import { DictationPipeline } from "@/client/dictation-pipeline";
import { WebSpeechSttProvider } from "@/speech/web-speech-stt";
import type { SttProvider, SttSession, SttState } from "@/speech/types";
import { newDocumentId } from "@/lib/ids";
import { DocumentSheet } from "./DocumentSheet";
import { MicButton } from "../voice/MicButton";

/**
 * The whole application surface: the document sheet + the mic button. Owns the
 * editor instance, builds the Editor Controller and the dictation pipeline, and
 * gates all editing behind the microphone being on.
 */
export function EditorWorkspace() {
  const editor = useEditor({
    extensions: getEditorExtensions({ placeholder: "Accendi il microfono e parla…" }),
    editable: false, // dictation-only: the page changes only from the mic
    immediatelyRender: false,
    content: "",
  });

  const pipelineRef = useRef<DictationPipeline | null>(null);
  const sttProviderRef = useRef<SttProvider | null>(null);
  const sessionRef = useRef<SttSession | null>(null);

  const [micOn, setMicOn] = useState(false);
  const [sttState, setSttState] = useState<SttState>("idle");
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);

  // Build the controller + pipeline once the editor exists.
  useEffect(() => {
    if (!editor) return;
    const controller = new EditorController(editor, new CheckpointStack(), {
      documentId: newDocumentId(),
      title: "Documento",
    });
    pipelineRef.current = new DictationPipeline(
      controller,
      new ConversationManager(),
      new ContextManager(),
      new TurnQueue(),
      { onProcessingChange: setProcessing },
    );

    // Dev-only hook: lets e2e/debug tooling drive the actuator directly
    // (the OpenAI-backed pipeline needs a key; this exercises the editor path).
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__editorController =
        controller;
    }
  }, [editor]);

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
      { lang: "it-IT" },
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
      <DocumentSheet editor={editor} />
      <MicButton
        on={micOn}
        supported={supported}
        processing={processing}
        state={sttState}
        interim={interim}
        onToggle={toggleMic}
      />
    </div>
  );
}
