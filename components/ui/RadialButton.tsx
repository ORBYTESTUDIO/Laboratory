'use client';

import {
  useRef,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import './RadialButton.css';

type Props = {
  children?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  icon?: ReactNode;
  width?: string | number | null;
  height?: string | number | null;
  backgroundColor?: string;
  textColor?: string;
  hoverTextColor?: string;
  hoverBackgroundColor?: string;
  borderColor?: string;
  hoverBorderColor?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Botón con efecto de relleno radial desde el cursor. Portado del sitio
 * principal de Orbyte; acá se quitaron las dependencias que no existen en Labs
 * (Lenis para scroll, sonidos), dejando sólo el efecto visual + onClick.
 */
export default function RadialButton({
  children,
  type = 'button',
  icon = null,
  width = null,
  height = null,
  backgroundColor = 'transparent',
  textColor = '#fff',
  hoverTextColor = '#000',
  hoverBackgroundColor = '#fff',
  borderColor = '#fff',
  hoverBorderColor = '#fff',
  onClick,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonSize, setButtonSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (buttonRef.current) {
      const { width, height } = buttonRef.current.getBoundingClientRect();
      setButtonSize({ width, height });
    }
  }, []);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--y', `${e.clientY - rect.top}px`);
  };

  return (
    <button
      type={type}
      className="radial-button uppercase"
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onClick={onClick}
      style={
        {
          width: width ?? undefined,
          height: height ?? undefined,
          '--initial-bg': backgroundColor,
          '--text-color': textColor,
          '--hover-bg': hoverBackgroundColor,
          '--hover-text-color': hoverTextColor,
          '--border-color': borderColor,
          '--hover-border-color': hoverBorderColor,
          '--button-width': `${buttonSize.width}px`,
          '--button-height': `${buttonSize.height}px`,
        } as CSSProperties
      }
    >
      <span className="button-content">
        {icon && <span className="button-icon">{icon}</span>}
        {children && <span className="button-label">{children}</span>}
      </span>
    </button>
  );
}
