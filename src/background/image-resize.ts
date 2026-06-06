export function calculateBoundedImageSize(input: {
  width: number;
  height: number;
  maxDimension?: number;
}): { width: number; height: number } {
  const maxDimension = input.maxDimension ?? 1800;
  const largest = Math.max(input.width, input.height);

  if (largest <= maxDimension) {
    return { height: input.height, width: input.width };
  }

  const scale = maxDimension / largest;
  return {
    height: Math.round(input.height * scale),
    width: Math.round(input.width * scale)
  };
}
