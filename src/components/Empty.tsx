import { FolderSearch } from "lucide-react";
import { Button } from "./ui/button";
export function Empty({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FolderSearch size={27} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
