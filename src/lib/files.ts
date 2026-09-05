import { save } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
export async function saveText(
  text: string,
  filename: string,
): Promise<boolean> {
  const extension = filename.split(".").pop() ?? "txt";
  const path = await save({
    defaultPath: filename,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!path) return false;
  await api.writeExport(path, text);
  return true;
}
