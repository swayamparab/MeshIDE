import api from "@/lib/api";

export interface Collaborator {
    id: string;
    projectId: string;
    userId: string;
    createdAt: string;
    user: {
        id: string;
        username: string;
        email: string;
    };
}

export async function addCollaborator(
    projectId: string,
    identifier: string,
) {
    const response = await api.post<{
        success: boolean;
        message: string;
        collaborator: Collaborator;
    }>(`/api/projects/${projectId}/collaborators`, {
        identifier
    });

    return response.data;
}