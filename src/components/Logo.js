import React from 'react';
import './Logo.css';

const Logo = ({ size = 'medium' }) => {
  const sizeClass = `logo-${size}`;
  
  return (
    <div className={`logo ${sizeClass}`}>
      <span className="logo-text">T</span>
    </div>
  );
};

export default Logo;
