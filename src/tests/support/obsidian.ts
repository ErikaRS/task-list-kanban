import momentInstance from "moment";

/** Minimal runtime implementation for unit tests; Obsidian supplies Moment in production. */
export const moment = (input?: Date) => momentInstance(input);
