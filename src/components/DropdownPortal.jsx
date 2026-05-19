import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const DropdownPortal = ({
  anchorRef,
  open,
  onClose,
  align = 'left',
  gap = 8,
  zIndex = 1000,
  children,
}) => {
  const [position, setPosition] = useState(null);
  const popupRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + gap,
      left: rect.left,
      right: window.innerWidth - rect.right,
      width: rect.width,
    });
  }, [anchorRef, gap]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (popupRef.current && popupRef.current.contains(e.target)) return;
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;

  const style = {
    position: 'fixed',
    top: position.top,
    zIndex,
    ...(align === 'right'
      ? { right: position.right }
      : { left: position.left }),
  };

  return createPortal(
    <div ref={popupRef} style={style}>
      {children}
    </div>,
    document.body
  );
};

export default DropdownPortal;
