export default function GlassCard({ children, className = '', hover = true, ...props }) {
  return (
    <div
      className={`bg-white border border-gray-200/60 rounded-[15px] shadow-sm ${hover ? 'transition-all duration-250 hover:shadow-md hover:border-gray-300/80' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
