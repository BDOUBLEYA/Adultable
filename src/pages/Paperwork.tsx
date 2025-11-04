import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Download } from "lucide-react";

export default function Paperwork() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Paperwork Assistant</h1>
        <p className="text-muted-foreground">Auto-fill and manage your forms with ease</p>
      </div>

      <Card className="shadow-card border-2 border-dashed">
        <CardContent className="pt-6 text-center py-12">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Upload Your Forms</h3>
          <p className="text-muted-foreground mb-4">
            Drag and drop or click to upload PDFs and images
          </p>
          <Button className="shadow-soft">
            <Upload className="mr-2 h-4 w-4" />
            Choose Files
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Feature coming soon!</p>
      </div>
    </div>
  );
}
