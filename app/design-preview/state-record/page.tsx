import { SecurityRecordPrototype } from "../../../components/marketing/security-record-prototype";

/**
 * Isolated visual-identity prototype route (docs/decisions/0077/0078) -- judged as a
 * prototype of a visual language, not as a finished landing page. Not linked from any
 * nav; not the production homepage. Delete or promote after the direction is judged.
 */
export default function StateRecordPreviewPage() {
  return <SecurityRecordPrototype />;
}
