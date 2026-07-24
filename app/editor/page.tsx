import { EditorWorkspace } from "@/components/editor/EditorWorkspace";

export const metadata = {
  title: "Documento — AI Voice Document Assistant",
};

/**
 * The editor route. Client-side workspace: the document sheet and the mic
 * button, nothing else. Editing happens only while the microphone is on.
 */
export default function EditorPage() {
  return <EditorWorkspace />;
}
