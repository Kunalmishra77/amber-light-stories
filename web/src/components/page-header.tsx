interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
