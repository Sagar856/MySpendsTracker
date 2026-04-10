import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { openLogin } from "../../netlify/functions/identity";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Personal Finance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in with an invited account to access your dashboards.
          </p>
          <Button className="w-full" onClick={openLogin}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}