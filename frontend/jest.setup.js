import '@testing-library/jest-dom';

// Mock scrollIntoView as it is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = jest.fn();
