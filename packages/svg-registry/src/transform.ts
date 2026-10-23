/**
 * SVG transform parsing (matrix, translate, scale, rotate, skewX, skewY)
 * into a 2D affine matrix [a b c d e f], plus decomposition into
 * translation / rotation / scale for diagram analysis.
 */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

export function applyMatrix(m: Matrix, p: { x: number; y: number }): { x: number; y: number } {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Parses an SVG `transform` attribute. Returns null for malformed input. */
export function parseTransform(value: string | undefined): Matrix | null {
  if (!value || !value.trim()) return IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let result: Matrix = IDENTITY;
  let consumed = '';
  while ((m = re.exec(value)) !== null) {
    consumed += m[0];
    const args = (m[2] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (args.some((n) => !Number.isFinite(n))) return null;
    let t: Matrix;
    switch (m[1]) {
      case 'matrix':
        if (args.length !== 6) return null;
        t = args as unknown as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale': {
        const sx = args[0] ?? 1;
        t = [sx, 0, 0, args[1] ?? sx, 0, 0];
        break;
      }
      case 'rotate': {
        const r = rad(args[0] ?? 0);
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const cx = args[1] ?? 0;
          const cy = args[2] ?? 0;
          t = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        } else t = rot;
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(rad(args[0] ?? 0)), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(rad(args[0] ?? 0)), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    result = multiply(result, t);
  }
  if (consumed.replace(/\s/g, '').length === 0) return null;
  return result;
}

export interface Decomposed {
  readonly translate: { x: number; y: number };
  /** Degrees, clockwise on screen, normalized to [0, 360). */
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** True when the matrix contains skew (decomposition is then approximate). */
  readonly skewed: boolean;
}

export function decompose(m: Matrix): Decomposed {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  const det = a * d - b * c;
  const scaleY = scaleX === 0 ? 0 : det / scaleX;
  let rotation = (Math.atan2(b, a) * 180) / Math.PI;
  rotation = ((rotation % 360) + 360) % 360;
  if (Math.abs(rotation - 360) < 1e-9) rotation = 0;
  const skew = scaleX === 0 ? 0 : (a * c + b * d) / (scaleX * scaleX);
  return { translate: { x: e, y: f }, rotation: Math.round(rotation * 1e6) / 1e6, scaleX, scaleY, skewed: Math.abs(skew) > 1e-6 };
}
