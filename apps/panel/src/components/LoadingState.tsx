export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div role="status" aria-live="polite">
      {message}
    </div>
  );
}
