import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../../parsing/properties/property_schema";
import type { AxisBucket } from "./board_matrix";

/**
 * Returns the status marker for a status-group bucket. Other property groups
 * intentionally keep their text labels because their values are not task
 * status markers and should not inherit checkbox styling.
 */
export function getGroupStatusMarker(bucket: AxisBucket): string | undefined {
	const source = bucket.meta?.source;
	const value = bucket.meta?.value;

	return source?.kind === "property" &&
		source.key === UNIVERSAL_STATUS_PROPERTY_KEY &&
		typeof value === "string"
		? value
		: undefined;
}
