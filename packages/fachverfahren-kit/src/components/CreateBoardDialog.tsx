// components/CreateBoardDialog — Board anlegen (Titel + optionale Beschreibung + Scope).
import * as React from "react";
import type { BoardVisibility, CreateBoardInput } from "../board-types.js";
import { Button } from "../ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

export interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateBoardInput) => void | Promise<void>;
}

export function CreateBoardDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateBoardDialogProps): React.ReactElement {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] =
    React.useState<BoardVisibility>("personal");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim() === "") return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        visibility,
      });
      setTitle("");
      setDescription("");
      setVisibility("personal");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neues Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Titel</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="z. B. Gewerbeanmeldung Team-Board"
                required
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Beschreibung (optional)
              </span>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Sichtbarkeit</span>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as BoardVisibility)
                }
              >
                <SelectTrigger aria-label="Sichtbarkeit wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Persönlich</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || title.trim() === ""}>
              Board erstellen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
