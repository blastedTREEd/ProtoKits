export const scrollMemory = {
  data: {},
  isGoingBack: false, // Flag para i-disable ang saving temporarily
  save(path, y) {
    if (this.isGoingBack) {
      this.isGoingBack = false; // Reset flag
      return; 
    }
    this.data = {}; // One page at a time
    this.data[path] = { y, time: Date.now() };
  },
  isValid(path) {
    const entry = this.data[path];
    if (!entry) return false;
    const isExpired = (Date.now() - entry.time) >= 5000;
    if (isExpired) {
      delete this.data[path];
      return false;
    }
    return true;
  },
  delete(path) {
    delete this.data[path];
  }
};