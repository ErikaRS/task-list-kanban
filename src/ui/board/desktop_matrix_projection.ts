import { getBoardCell } from "./board_matrix";
import type { AxisBucket, BoardMatrix, PrimaryBucketId, SecondaryBucketId } from "./board_matrix";

/**
 * Presentation-only view of the canonical board matrix. The underlying matrix
 * always remains primary-column by secondary-group; desktop flow only decides
 * which axis is drawn horizontally and which vertically.
 */
export interface DesktopMatrixProjection {
	visualColumns: AxisBucket[];
	visualRows: AxisBucket[];
	showColumnHeaders: boolean;
	showRowHeaders: boolean;
	cellVerticalFlow: boolean;
	getCell: (visualColumn: AxisBucket, visualRow: AxisBucket) => {
		cell: ReturnType<typeof getBoardCell>;
		primaryBucket: AxisBucket<PrimaryBucketId>;
		secondaryBucket: AxisBucket<SecondaryBucketId>;
	};
}

export function deriveDesktopMatrixProjection(
	matrix: BoardMatrix,
	isVerticalFlow: boolean,
): DesktopMatrixProjection {
	const visualColumns = isVerticalFlow ? matrix.secondaryAxis : matrix.primaryAxis;
	const visualRows = isVerticalFlow ? matrix.primaryAxis : matrix.secondaryAxis;
	// Unassigned (and empty file groups) are real headers. Only the synthetic
	// bucket belonging to an ungrouped board is label-less.
	const hasLabels = (axis: AxisBucket[]) => axis.some(bucket =>
		!(bucket.kind === "group" && bucket.meta?.source?.kind === "none"));
	const primaryById = new Map(matrix.primaryAxis.map(bucket => [bucket.id, bucket]));
	const secondaryById = new Map(matrix.secondaryAxis.map(bucket => [bucket.id, bucket]));
	return {
		visualColumns, visualRows,
		showColumnHeaders: hasLabels(visualColumns),
		showRowHeaders: hasLabels(visualRows),
		cellVerticalFlow: isVerticalFlow,
		getCell(visualColumn, visualRow) {
			const { primaryId, secondaryId } = getCanonicalCellAxisIds(visualColumn, visualRow, isVerticalFlow);
			return {
				cell: getBoardCell(matrix, primaryId, secondaryId),
				primaryBucket: primaryById.get(primaryId)!,
				secondaryBucket: secondaryById.get(secondaryId)!,
			};
		},
	};
}

export function getCanonicalCellAxisIds(
	visualColumn: AxisBucket,
	visualRow: AxisBucket,
	isVerticalFlow: boolean,
): { primaryId: PrimaryBucketId; secondaryId: SecondaryBucketId } {
	return isVerticalFlow
		? {
			primaryId: visualRow.id as PrimaryBucketId,
			secondaryId: visualColumn.id,
		}
		: {
			primaryId: visualColumn.id as PrimaryBucketId,
			secondaryId: visualRow.id,
		};
}
