/**
 * The engines a calculation can actually use. `mixed` is a report-only state:
 * a group of parallel requests can contain both a GPU result and a CPU fallback.
 */
export type ComputeBackend = 'cpu' | 'webgpu';
export type CalculationBackend = ComputeBackend | 'mixed';

export function combineCalculationBackends(backends: readonly ComputeBackend[]): CalculationBackend {
  const usesCpu = backends.includes('cpu');
  const usesWebGpu = backends.includes('webgpu');
  if (usesCpu && usesWebGpu) return 'mixed';
  return usesWebGpu ? 'webgpu' : 'cpu';
}

export function calculationBackendLabel(backend: CalculationBackend): string {
  if (backend === 'webgpu') return 'Graphics card';
  if (backend === 'mixed') return 'Graphics card + processor';
  return 'Processor';
}
