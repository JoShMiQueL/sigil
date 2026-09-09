export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" style={{ color: "red" }}>
      {message}
    </div>
  );
}
