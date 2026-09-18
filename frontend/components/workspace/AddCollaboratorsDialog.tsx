"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useAddCollaborator } from "@/hooks/useCollaborators";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface AddCollaboratorsDialogProps {
    projectId: string;
}

export default function AddCollaboratorsDialog({
    projectId,
}: AddCollaboratorsDialogProps) {
    const [identifier, setIdentifier] = useState("");

    const addCollaboratorMutation = useAddCollaborator();

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmedIdentifier = identifier.trim();

        if (!trimmedIdentifier) {
            toast.error("Enter a username or email");
            return;
        }

        addCollaboratorMutation.mutate(
            {
                projectId,
                identifier: trimmedIdentifier,
            },
            {
                onSuccess: (data) => {
                    toast.success(data.message);
                    setIdentifier("");
                },
                onError: (error: any) => {
                    toast.error(
                        error?.response?.data?.message ||
                        "Failed to add collaborator",
                    );
                },
            },
        );
    };

    return (
        <Dialog>
            <DialogTrigger>
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">
                    <UserPlus className="h-4 w-4" />
                    Add Collaborator
                </span>
            </DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Collaborator</DialogTitle>

                    <DialogDescription>
                        Add a user to this project using their username or
                        email address.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="identifier">
                            Username or Email
                        </Label>

                        <Input
                            id="identifier"
                            placeholder="Enter username or email"
                            value={identifier}
                            onChange={(event) =>
                                setIdentifier(event.target.value)
                            }
                            disabled={addCollaboratorMutation.isPending}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={
                            addCollaboratorMutation.isPending ||
                            !identifier.trim()
                        }
                    >
                        {addCollaboratorMutation.isPending
                            ? "Adding..."
                            : "Add Collaborator"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}