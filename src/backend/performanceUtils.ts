export const callFnToCheckPerformance = async <T>(fn: () => T | Promise<T>) => {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();

  return {
    result,
    time: endTime - startTime,
  };
};
