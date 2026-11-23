// Board presentation: which tasks a board shows and where (SPEC 0057).
//
// The single place that turns a board's tasks and resolved settings into
// what a renderer draws: the applied filter, the filtered tasks, the matrix
// (column grouping, uncategorized/done visibility, ordering with RTL/BTT
// reversal, swimlanes, collapse), the count label, and the flow axis.
//
// Renderers must not re-derive any of this inline. The full board
// (`main.svelte`) calls it now; the read-only embedded board calls it from
// SPEC 0057 Phase 3. A presentation rule added in one renderer only makes the
// two silently disagree.
import type { Task } from "../tasks/task";
import {
	FlowDirection,
	type SettingValues,
} from "../settings/settings_store";
import {
	isEmptyFilterQuery,
	parseFilterQueryResult,
	taskMatchesFilterQuery,
	type FilterQuery,
} from "../filters/filter_query";
import { getSchemaImpl } from "../../parsing/properties/index";
import { PropertySchemaOption } from "../../parsing/properties/property_schema";
import { getBoardTaskCount } from "../board_counts";
import {
	deriveBoardMatrix,
	hideSwimlanesWithOnlyCollapsedContent,
	type BoardMatrix,
} from "./board_matrix";

export interface BoardFilter {
	query: FilterQuery;
	/** The parser's message when the query text does not parse. */
	error?: string;
	/** True for a non-empty query, and for a query that failed to parse. */
	isFiltered: boolean;
}

/** Date property names the filter language accepts for this board. */
export function boardDateFilterKeys(
	settings: Pick<SettingValues, "propertySchema">,
): string[] {
	return getSchemaImpl(settings.propertySchema ?? PropertySchemaOption.None)
		.knownKeys()
		.filter((key) => key.type === "date")
		.map((key) => key.key);
}

export function resolveBoardFilter(
	queryText: string,
	dateFilterKeys: string[],
): BoardFilter {
	const { query, error } = parseFilterQueryResult(queryText, dateFilterKeys);
	return {
		query,
		...(error ? { error } : {}),
		isFiltered: !!error || !isEmptyFilterQuery(query),
	};
}

/** A filter that fails to parse shows nothing rather than everything. */
export function filterBoardTasks(
	tasks: Task[],
	filter: BoardFilter,
	today: Date,
): Task[] {
	if (filter.error) return [];
	if (!filter.isFiltered) return tasks;
	return tasks.filter((task) => taskMatchesFilterQuery(task, filter.query, today));
}

export function boardTaskCountLabel(
	allTasks: readonly Task[],
	filteredTasks: readonly Task[],
	isFiltered: boolean,
	showArchivedColumn: boolean,
): string {
	const total = getBoardTaskCount(allTasks);
	const label = isFiltered
		? `${getBoardTaskCount(filteredTasks)} of ${total} tasks`
		: `Total: ${total} tasks`;
	return label + (showArchivedColumn ? " (active)" : "");
}

export function isVerticalFlowDirection(flowDirection: FlowDirection | undefined): boolean {
	return flowDirection === FlowDirection.TopToBottom ||
		flowDirection === FlowDirection.BottomToTop;
}

export interface BoardPresentationInput {
	/** Every parsed task in the board's scope. */
	tasks: Task[];
	settings: SettingValues;
	filter: BoardFilter;
	/**
	 * Collapsed column ids. The full board keeps these in a session store
	 * seeded from settings; omitted, `settings.collapsedColumns` applies.
	 */
	collapsedColumns?: Iterable<string>;
	today: Date;
}

export interface BoardPresentation {
	filteredTasks: Task[];
	/** The complete matrix; selection and task actions use this one. */
	matrix: BoardMatrix;
	/** `matrix` minus swimlanes whose cards are all in collapsed columns. */
	renderedMatrix: BoardMatrix;
	countLabel: string;
	isVerticalFlow: boolean;
}

export function presentBoard(input: BoardPresentationInput): BoardPresentation {
	const { tasks, settings, filter, today } = input;
	const filteredTasks = filterBoardTasks(tasks, filter, today);
	const collapsedColumns = input.collapsedColumns === undefined
		? settings.collapsedColumns
		: Array.from(input.collapsedColumns);
	const matrix = deriveBoardMatrix(
		filteredTasks,
		settings.columns,
		{ ...settings, collapsedColumns },
		today,
	);
	return {
		filteredTasks,
		matrix,
		renderedMatrix: hideSwimlanesWithOnlyCollapsedContent(matrix),
		countLabel: boardTaskCountLabel(
			tasks,
			filteredTasks,
			filter.isFiltered,
			settings.showArchivedColumn ?? false,
		),
		isVerticalFlow: isVerticalFlowDirection(settings.flowDirection),
	};
}
