import {
    pgTable,
    uuid,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

import { projects } from "./projects.js";
import { users } from "./users.js";

export const projectCollaborators = pgTable("project_collaborators", {
    
    id: uuid("id").defaultRandom().primaryKey(),

    projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, {
            onDelete: "cascade",
        }),

    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
            onDelete: "cascade",
        }),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    })
        .defaultNow()
        .notNull(),
},
    (table) => [
        uniqueIndex("project_collaborators_unique_idx").on(
            table.projectId,
            table.userId,
        ),
    ],
);