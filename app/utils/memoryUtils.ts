const formatMemorySize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};

interface ChromePerformance extends Performance {
  memory: {
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  }
}

export const logMemoryUsage = () => {
  if (global.performance && (global.performance as ChromePerformance).memory) {
    const memory = (global.performance as ChromePerformance).memory;
    console.log('Memory Usage:');
    console.log(`  Total JS Heap Size: ${formatMemorySize(memory.totalJSHeapSize)}`);
    console.log(`  Used JS Heap Size: ${formatMemorySize(memory.usedJSHeapSize)}`);
    console.log(`  JS Heap Size Limit: ${formatMemorySize(memory.jsHeapSizeLimit)}`);
  }
  
  if (global.gc) {
    console.log('Triggering garbage collection...');
    global.gc();
  }
};
