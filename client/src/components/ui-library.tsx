import React, { ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export const Button = React.forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline', isLoading?: boolean }>(
  ({ className, variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    const baseStyle = "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";
    
    const variants = {
      primary: "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:from-primary/90 hover:to-primary",
      secondary: "bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground shadow-lg shadow-secondary/20 hover:shadow-secondary/40 hover:from-secondary/90 hover:to-secondary",
      ghost: "hover:bg-white/5 text-foreground hover:text-primary",
      outline: "border border-border bg-transparent hover:bg-white/5 text-foreground"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyle, variants[variant], "px-6 py-3 h-12", className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export const Input = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground shadow-inner transition-all placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-black/40",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Avatar = ({ src, fallback, size = "md", className }: { src?: string | null, fallback: string, size?: 'sm' | 'md' | 'lg' | 'xl', className?: string }) => {
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-base",
    xl: "w-20 h-20 text-xl"
  };
  
  return (
    <div className={cn("relative rounded-full flex items-center justify-center font-bold overflow-hidden bg-gradient-to-br from-border to-card shrink-0 ring-2 ring-white/5", sizes[size], className)}>
      {src ? (
        <img src={src} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="gold-gradient-text uppercase">{fallback.substring(0, 2)}</span>
      )}
    </div>
  );
};
