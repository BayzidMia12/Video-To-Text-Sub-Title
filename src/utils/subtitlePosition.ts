import type {
  SubtitleGridPreset,
  SubtitleTrackPosition,
} from "../types/subtitle";
import { clampPositionPercent } from "../services/storageService";

export interface Dimensions {
  width: number;
  height: number;
}

export interface VideoSafeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const GRID_POSITION_OPTIONS: Array<{
  id: Exclude<SubtitleGridPreset, "custom">;
  label: string;
  shortLabel: string;
  horizontalMode: "left" | "center" | "right";
  horizontalPercent: number;
  verticalPreset: "top" | "middle" | "bottom";
  sourceVerticalPercent: number;
  targetVerticalPercent: number;
}> = [
  {
    id: "top_left",
    label: "Top Left",
    shortLabel: "Top L",
    horizontalMode: "left",
    horizontalPercent: 6,
    verticalPreset: "top",
    sourceVerticalPercent: 4,
    targetVerticalPercent: 18,
  },
  {
    id: "top_center",
    label: "Top Center",
    shortLabel: "Top C",
    horizontalMode: "center",
    horizontalPercent: 50,
    verticalPreset: "top",
    sourceVerticalPercent: 4,
    targetVerticalPercent: 18,
  },
  {
    id: "top_right",
    label: "Top Right",
    shortLabel: "Top R",
    horizontalMode: "right",
    horizontalPercent: 94,
    verticalPreset: "top",
    sourceVerticalPercent: 4,
    targetVerticalPercent: 18,
  },
  {
    id: "middle_left",
    label: "Middle Left",
    shortLabel: "Mid L",
    horizontalMode: "left",
    horizontalPercent: 6,
    verticalPreset: "middle",
    sourceVerticalPercent: 42,
    targetVerticalPercent: 56,
  },
  {
    id: "middle_center",
    label: "Middle Center",
    shortLabel: "Mid C",
    horizontalMode: "center",
    horizontalPercent: 50,
    verticalPreset: "middle",
    sourceVerticalPercent: 42,
    targetVerticalPercent: 56,
  },
  {
    id: "middle_right",
    label: "Middle Right",
    shortLabel: "Mid R",
    horizontalMode: "right",
    horizontalPercent: 94,
    verticalPreset: "middle",
    sourceVerticalPercent: 42,
    targetVerticalPercent: 56,
  },
  {
    id: "bottom_left",
    label: "Bottom Left",
    shortLabel: "Bot L",
    horizontalMode: "left",
    horizontalPercent: 6,
    verticalPreset: "bottom",
    sourceVerticalPercent: 82,
    targetVerticalPercent: 95,
  },
  {
    id: "bottom_center",
    label: "Bottom Center",
    shortLabel: "Bot C",
    horizontalMode: "center",
    horizontalPercent: 50,
    verticalPreset: "bottom",
    sourceVerticalPercent: 82,
    targetVerticalPercent: 95,
  },
  {
    id: "bottom_right",
    label: "Bottom Right",
    shortLabel: "Bot R",
    horizontalMode: "right",
    horizontalPercent: 94,
    verticalPreset: "bottom",
    sourceVerticalPercent: 82,
    targetVerticalPercent: 95,
  },
];

export function resolveGridPresetFromPosition(
  pos: SubtitleTrackPosition,
  trackKind: "source" | "target"
): SubtitleGridPreset {
  for (const opt of GRID_POSITION_OPTIONS) {
    const expectedV =
      trackKind === "source"
        ? opt.sourceVerticalPercent
        : opt.targetVerticalPercent;
    if (
      Math.abs(pos.horizontalPercent - opt.horizontalPercent) <= 5 &&
      Math.abs(pos.verticalPercent - expectedV) <= 6
    ) {
      return opt.id;
    }
  }
  return "custom";
}

export function applyGridPresetToPosition(
  pos: SubtitleTrackPosition,
  gridId: Exclude<SubtitleGridPreset, "custom">,
  trackKind: "source" | "target"
): SubtitleTrackPosition {
  const opt = GRID_POSITION_OPTIONS.find((item) => item.id === gridId);
  if (!opt) return pos;
  return {
    ...pos,
    verticalPreset: opt.verticalPreset,
    verticalPercent:
      trackKind === "source"
        ? opt.sourceVerticalPercent
        : opt.targetVerticalPercent,
    horizontalMode: opt.horizontalMode,
    horizontalPercent: opt.horizontalPercent,
  };
}

/**
 * Computes the exact visible video display rectangle (accounting for `object-contain`
 * letterboxing/pillarboxing) with zero artificial top/bottom limits so subtitles can reach
 * 0% (very top) through 100% (very bottom) of the video display area.
 */
export function computeVideoSafeRect(
  stageSize: Dimensions,
  videoNaturalSize: Dimensions | null,
  options?: {
    aspectFitMode?: "contain" | "cover" | "fill";
  }
): VideoSafeRect {
  const stageW = Math.max(160, stageSize.width || 0);
  const stageH = Math.max(90, stageSize.height || 0);

  let renderedLeft = 0;
  let renderedTop = 0;
  let renderedW = stageW;
  let renderedH = stageH;

  const fitMode = options?.aspectFitMode ?? "contain";
  if (
    fitMode === "contain" &&
    videoNaturalSize &&
    videoNaturalSize.width > 0 &&
    videoNaturalSize.height > 0
  ) {
    const stageAspect = stageW / stageH;
    const videoAspect = videoNaturalSize.width / videoNaturalSize.height;

    if (videoAspect > stageAspect) {
      renderedW = stageW;
      renderedH = stageW / videoAspect;
      renderedTop = (stageH - renderedH) / 2;
    } else {
      renderedH = stageH;
      renderedW = stageH * videoAspect;
      renderedLeft = (stageW - renderedW) / 2;
    }
  }

  // Minimal horizontal margin so text never touches vertical side borders;
  // zero vertical padding so Y=0% and Y=100% align with the exact video top and bottom edges.
  const sidePad = Math.max(6, Math.round(renderedW * 0.015));

  return {
    left: Math.round(renderedLeft + sidePad),
    top: Math.round(renderedTop),
    width: Math.max(80, Math.round(renderedW - sidePad * 2)),
    height: Math.max(60, Math.round(renderedH)),
  };
}

export function resolveTrackTextAlign(
  pos: SubtitleTrackPosition
): "left" | "center" | "right" {
  if (
    pos.textAlign === "left" ||
    pos.textAlign === "center" ||
    pos.textAlign === "right"
  ) {
    return pos.textAlign;
  }
  if (pos.horizontalMode === "left") return "left";
  if (pos.horizontalMode === "right") return "right";
  if (pos.horizontalMode === "center") return "center";
  if (pos.horizontalPercent < 28) return "left";
  if (pos.horizontalPercent > 72) return "right";
  return "center";
}

/**
 * Computes responsive subtitle font size (px) based on the active video display dimensions,
 * preventing oversized desktop text from overflowing mobile portrait/landscape screens
 * while scaling naturally up in Fullscreen.
 */
export function computeResponsiveFontPx(
  basePx: number,
  safeRect: Dimensions,
  isFullscreen: boolean
): number {
  const widthRatio = safeRect.width / 640;
  const heightRatio = safeRect.height / 360;
  const scaleFactor = Math.min(widthRatio, heightRatio * 1.08);
  const clampedFactor = isFullscreen
    ? Math.max(1.05, Math.min(1.48, scaleFactor))
    : Math.max(0.68, Math.min(1.22, scaleFactor));

  return Math.max(9, Math.min(54, Math.round(basePx * clampedFactor)));
}

/**
 * Maps a pointer drag delta (dx, dy) 1:1 to percentage changes using the anchor formula:
 * `leftPx = (h% / 100) * (safeWidth - boxWidth)`
 * `topPx  = (v% / 100) * (safeHeight - boxHeight - bottomOffsetPx)`
 */
export function computeDraggedTrackPercents(params: {
  startHorizontalPercent: number;
  startVerticalPercent: number;
  dx: number;
  dy: number;
  safeWidth: number;
  safeHeight: number;
  boxWidth: number;
  boxHeight: number;
  bottomOffsetPx?: number;
}): { horizontalPercent: number; verticalPercent: number } {
  const bottomOffset = Math.max(0, Math.min(200, params.bottomOffsetPx ?? 0));
  const effectiveW = Math.max(16, params.safeWidth - params.boxWidth);
  const effectiveH = Math.max(
    16,
    params.safeHeight - params.boxHeight - bottomOffset
  );

  const rawH = params.startHorizontalPercent + (params.dx / effectiveW) * 100;
  const rawV = params.startVerticalPercent + (params.dy / effectiveH) * 100;

  return {
    horizontalPercent: clampPositionPercent(rawH, params.startHorizontalPercent),
    verticalPercent: clampPositionPercent(rawV, params.startVerticalPercent),
  };
}

export interface DualLayoutTrackInput {
  visible: boolean;
  desiredH: number;
  desiredV: number;
  boxWidth: number;
  boxHeight: number;
  fontPx: number;
  bottomOffsetPx?: number;
}

export interface DualSubtitleLayoutResult {
  sourceLeftPx: number;
  sourceTopPx: number;
  targetLeftPx: number;
  targetTopPx: number;
  gapPx: number;
  overlapDetected: boolean;
}

/**
 * Height-aware dual-subtitle layout solver:
 * - Keeps both tracks strictly inside `safeRect` across 0%..100% (including wrapped lines)
 * - Respects per-track `bottomOffsetPx` (`0px` = flush with video display bottom at Y=100%)
 * - In Auto Dual Layout (`autoDualLayout = true`), keeps Original above Bengali with `groupSpacingPx`
 * - In Manual Mode with `autoCollisionPrevention = true`, preserves order while resolving overlaps
 */
export function solveDualSubtitleLayout(params: {
  safeWidth: number;
  safeHeight: number;
  autoDualLayout: boolean;
  autoCollisionPrevention?: boolean;
  groupSpacingPx?: number;
  source: DualLayoutTrackInput;
  target: DualLayoutTrackInput;
}): DualSubtitleLayoutResult {
  const {
    safeWidth,
    safeHeight,
    autoDualLayout,
    autoCollisionPrevention = true,
    groupSpacingPx,
    source,
    target,
  } = params;

  const sW = Math.min(safeWidth, Math.max(0, source.boxWidth));
  const sH = Math.min(safeHeight, Math.max(0, source.boxHeight));
  const tW = Math.min(safeWidth, Math.max(0, target.boxWidth));
  const tH = Math.min(safeHeight, Math.max(0, target.boxHeight));

  const sourceBottomOffset = Math.max(
    0,
    Math.min(200, source.bottomOffsetPx ?? 0)
  );
  const targetBottomOffset = Math.max(
    0,
    Math.min(200, target.bottomOffsetPx ?? 0)
  );

  const maxSourceLeft = Math.max(0, safeWidth - sW);
  const maxTargetLeft = Math.max(0, safeWidth - tW);
  const maxSourceTop = Math.max(0, safeHeight - sH - sourceBottomOffset);
  const maxTargetTop = Math.max(0, safeHeight - tH - targetBottomOffset);

  const sourceLeftPx = Math.round(
    (clampPositionPercent(source.desiredH, 50) / 100) * maxSourceLeft
  );
  const targetLeftPx = Math.round(
    (clampPositionPercent(target.desiredH, 50) / 100) * maxTargetLeft
  );

  let sourceTopPx = Math.round(
    (clampPositionPercent(source.desiredV, 82) / 100) * maxSourceTop
  );
  let targetTopPx = Math.round(
    (clampPositionPercent(target.desiredV, 95) / 100) * maxTargetTop
  );

  const requestedGap =
    typeof groupSpacingPx === "number" && Number.isFinite(groupSpacingPx)
      ? Math.max(0, Math.min(48, Math.round(groupSpacingPx)))
      : Math.max(
          6,
          Math.min(18, Math.round((source.fontPx + target.fontPx) * 0.28))
        );

  if (!source.visible || !target.visible) {
    return {
      sourceLeftPx,
      sourceTopPx,
      targetLeftPx,
      targetTopPx,
      gapPx: requestedGap,
      overlapDetected: false,
    };
  }

  const maxUsableBottom = Math.max(
    sH + tH,
    safeHeight - Math.min(sourceBottomOffset, targetBottomOffset)
  );
  const effectiveGap =
    sH + tH + requestedGap > maxUsableBottom
      ? Math.max(0, maxUsableBottom - sH - tH)
      : requestedGap;

  if (autoDualLayout) {
    if (sourceTopPx <= targetTopPx) {
      const minTargetTop = sourceTopPx + sH + effectiveGap;
      if (targetTopPx < minTargetTop) {
        if (minTargetTop <= maxTargetTop) {
          targetTopPx = minTargetTop;
        } else {
          targetTopPx = maxTargetTop;
          sourceTopPx = Math.max(
            0,
            Math.min(maxSourceTop, targetTopPx - effectiveGap - sH)
          );
        }
      }
    } else {
      // Keep English cleanly above Bengali even when source desiredV > target desiredV
      const anchorTarget = Math.min(
        maxTargetTop,
        Math.max(sH + effectiveGap, sourceTopPx)
      );
      targetTopPx = anchorTarget;
      sourceTopPx = Math.max(
        0,
        Math.min(maxSourceTop, targetTopPx - effectiveGap - sH)
      );
    }

    return {
      sourceLeftPx,
      sourceTopPx: Math.round(sourceTopPx),
      targetLeftPx,
      targetTopPx: Math.round(targetTopPx),
      gapPx: effectiveGap,
      overlapDetected: false,
    };
  }

  // Manual mode: check 2D bounding-box overlap
  const horizontalOverlap =
    sourceLeftPx < targetLeftPx + tW + 2 &&
    sourceLeftPx + sW + 2 > targetLeftPx;
  const verticalOverlap =
    sourceTopPx < targetTopPx + tH + 2 &&
    sourceTopPx + sH + 2 > targetTopPx;
  const isOverlapping = horizontalOverlap && verticalOverlap;

  if (autoCollisionPrevention && isOverlapping) {
    if (sourceTopPx <= targetTopPx) {
      const minTargetTop = sourceTopPx + sH + effectiveGap;
      if (minTargetTop <= maxTargetTop) {
        targetTopPx = minTargetTop;
      } else {
        targetTopPx = maxTargetTop;
        sourceTopPx = Math.max(
          0,
          Math.min(maxSourceTop, targetTopPx - effectiveGap - sH)
        );
      }
    } else {
      const minSourceTop = targetTopPx + tH + effectiveGap;
      if (minSourceTop <= maxSourceTop) {
        sourceTopPx = minSourceTop;
      } else {
        sourceTopPx = maxSourceTop;
        targetTopPx = Math.max(
          0,
          Math.min(maxTargetTop, sourceTopPx - effectiveGap - tH)
        );
      }
    }

    return {
      sourceLeftPx,
      sourceTopPx: Math.round(sourceTopPx),
      targetLeftPx,
      targetTopPx: Math.round(targetTopPx),
      gapPx: effectiveGap,
      overlapDetected: false,
    };
  }

  return {
    sourceLeftPx,
    sourceTopPx,
    targetLeftPx,
    targetTopPx,
    gapPx: effectiveGap,
    overlapDetected: isOverlapping,
  };
}

/**
 * Separates overlapping manual positions cleanly without overwriting X alignment.
 */
export function computeAutoFixedPositions(
  sourcePos: SubtitleTrackPosition,
  targetPos: SubtitleTrackPosition
): {
  sourcePosition: SubtitleTrackPosition;
  targetPosition: SubtitleTrackPosition;
} {
  const avgY = Math.round(
    (sourcePos.verticalPercent + targetPos.verticalPercent) / 2
  );
  let nextSourceY = Math.max(4, Math.min(84, avgY - 8));
  let nextTargetY = Math.min(98, nextSourceY + 14);
  if (nextTargetY - nextSourceY < 12) {
    nextSourceY = Math.max(4, nextTargetY - 14);
  }

  return {
    sourcePosition: {
      ...sourcePos,
      verticalPreset: "custom",
      verticalPercent: nextSourceY,
    },
    targetPosition: {
      ...targetPos,
      verticalPreset: "custom",
      verticalPercent: nextTargetY,
    },
  };
}
