import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { withPasteUpload } from '../withPasteUpload';

describe('withPasteUpload HOC', () => {
  const MockUploadComponent: React.FC<any> = (props) => {
    return (
      <div data-testid="inner-upload">
        <input type="file" />
        <span>Mock Upload</span>
      </div>
    );
  };
  MockUploadComponent.displayName = 'MockUpload';
  (MockUploadComponent as any).ReadPretty = () => <div data-testid="read-pretty">Preview</div>;

  const EnhancedUpload = withPasteUpload(MockUploadComponent);

  it('should render wrapped component and set data attributes in edit mode', () => {
    const { container, getByTestId } = render(
      <EnhancedUpload
        accept="image/*"
        rules={{ size: 10485760 }}
        multiple={true}
      />
    );

    const wrapper = container.querySelector('.nb-paste-upload-container');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute('data-paste-upload')).toBe('true');
    expect(wrapper?.getAttribute('data-accept')).toBe('image/*');
    expect(wrapper?.getAttribute('data-max-size')).toBe('10485760');
    expect(wrapper?.getAttribute('data-multiple')).toBe('true');

    expect(getByTestId('inner-upload')).not.toBeNull();
  });

  it('should bypass wrapper container in readPretty mode', () => {
    const { container, queryByTestId } = render(
      <EnhancedUpload readPretty={true} />
    );

    const wrapper = container.querySelector('.nb-paste-upload-container');
    expect(wrapper).toBeNull();
    expect(queryByTestId('inner-upload')).not.toBeNull();
  });

  it('should preserve static ReadPretty and subcomponents properties', () => {
    (MockUploadComponent as any).Attachment = () => <div>Attachment</div>;
    (MockUploadComponent as any).Dragger = () => <div>Dragger</div>;
    const Enhanced = withPasteUpload(MockUploadComponent);

    expect((Enhanced as any).ReadPretty).toBeDefined();
    expect((Enhanced as any).Attachment).toBeDefined();
    expect((Enhanced as any).Dragger).toBeDefined();
    expect((Enhanced as any).displayName).toBe('withPasteUpload(MockUpload)');
  });

  it('should forward ref to the wrapped component', () => {
    const ComponentWithRef = React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div ref={ref} data-testid="ref-target">
        Ref Target
      </div>
    ));
    const Enhanced = withPasteUpload(ComponentWithRef);

    const ref = React.createRef<HTMLDivElement>();
    render(<Enhanced ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-testid')).toBe('ref-target');
  });

  it('should extract rules from array format', () => {
    const { container } = render(
      <EnhancedUpload
        rules={[{ size: 5242880, mimetype: 'image/*' }]}
        multiple={false}
      />
    );

    const wrapper = container.querySelector('.nb-paste-upload-container');
    expect(wrapper?.getAttribute('data-max-size')).toBe('5242880');
    expect(wrapper?.getAttribute('data-accept')).toBe('image/*');
    expect(wrapper?.getAttribute('data-multiple')).toBe('false');
  });

  it('should deactivate manager activeTarget upon component unmount', async () => {
    const { initPasteUploadManager, destroyPasteUploadManager } = await import('../pasteUploadManager');
    const manager = initPasteUploadManager();

    const { container, unmount } = render(<EnhancedUpload />);
    const wrapper = container.querySelector('.nb-paste-upload-container') as HTMLElement;

    wrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(wrapper);

    unmount();
    expect(manager.getActiveTarget()).toBeNull();
    destroyPasteUploadManager();
  });

  it('should deactivate manager activeTarget when component becomes disabled', async () => {
    const { initPasteUploadManager, destroyPasteUploadManager } = await import('../pasteUploadManager');
    const manager = initPasteUploadManager();

    const { container, rerender } = render(<EnhancedUpload disabled={false} />);
    const wrapper = container.querySelector('.nb-paste-upload-container') as HTMLElement;

    wrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(wrapper);

    rerender(<EnhancedUpload disabled={true} />);
    expect(manager.getActiveTarget()).toBeNull();
    destroyPasteUploadManager();
  });

  it('should extract maxSize and accept rule variants from rules array', () => {
    const { container } = render(
      <EnhancedUpload
        rules={[{ maxSize: 2048, accept: 'image/jpeg' }]}
      />
    );

    const wrapper = container.querySelector('.nb-paste-upload-container');
    expect(wrapper?.getAttribute('data-max-size')).toBe('2048');
    expect(wrapper?.getAttribute('data-accept')).toBe('image/jpeg');
  });

  it('should join accept array into comma-separated string for data-accept attribute', () => {
    const { container } = render(
      <EnhancedUpload accept={['image/png', 'image/jpeg']} />
    );

    const wrapper = container.querySelector('.nb-paste-upload-container');
    expect(wrapper?.getAttribute('data-accept')).toBe('image/png,image/jpeg');
  });

  it('should safely return undefined/null if WrappedComponent is null or undefined', () => {
    expect(withPasteUpload(null as any)).toBeNull();
    expect(withPasteUpload(undefined as any)).toBeUndefined();
  });

  it('should dynamically switch between edit and readPretty mode without violating React hook rules and clean up activeTarget', async () => {
    const { initPasteUploadManager, destroyPasteUploadManager } = await import('../pasteUploadManager');
    const manager = initPasteUploadManager();

    const { container, rerender } = render(<EnhancedUpload readPretty={false} />);
    const wrapper = container.querySelector('.nb-paste-upload-container') as HTMLElement;
    expect(wrapper).not.toBeNull();

    wrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(wrapper);

    // Switch to readPretty - must not crash with hook rules violation, and must deactivate activeTarget
    rerender(<EnhancedUpload readPretty={true} />);
    expect(container.querySelector('.nb-paste-upload-container')).toBeNull();
    expect(manager.getActiveTarget()).toBeNull();

    // Switch back to edit mode - hooks must preserve correct count and order
    rerender(<EnhancedUpload readPretty={false} />);
    expect(container.querySelector('.nb-paste-upload-container')).not.toBeNull();

    destroyPasteUploadManager();
  });
});
