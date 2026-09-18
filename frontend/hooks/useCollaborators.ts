import { useMutation } from "@tanstack/react-query";

import { addCollaborator } from "@/services/collaborator";

export function useAddCollaborator() {
    return useMutation({
        mutationFn: ({
            projectId,
            identifier,
        }: {
            projectId: string;
            identifier: string;
        }) => addCollaborator(projectId, identifier),
    });
}