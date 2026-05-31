Add-Type -AssemblyName System.Drawing

$csharpCode = @"
using System;
using System.Drawing;
using System.Collections.Generic;

public class ImageProcessor {
    public static void MakeBackgroundTransparent(string inputPath, string outputPath) {
        Bitmap original = new Bitmap(inputPath);
        // Clone to copy pixels and release lock on the file
        Bitmap bmp = new Bitmap(original);
        original.Dispose(); // Releases the file lock!
        
        int w = bmp.Width;
        int h = bmp.Height;
        bool[,] visited = new bool[w, h];
        Queue<Point> q = new Queue<Point>();
        
        // Find background color (top-left pixel)
        Color bg = bmp.GetPixel(0, 0);
        
        q.Enqueue(new Point(0, 0));
        visited[0, 0] = true;
        
        int[] dx = { 0, 0, 1, -1 };
        int[] dy = { 1, -1, 0, 0 };
        
        List<Point> toClear = new List<Point>();
        
        while (q.Count > 0) {
            Point p = q.Dequeue();
            toClear.Add(p);
            
            for (int i = 0; i < 4; i++) {
                int nx = p.X + dx[i];
                int ny = p.Y + dy[i];
                
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    if (!visited[nx, ny]) {
                        Color c = bmp.GetPixel(nx, ny);
                        // Check if it matches the background color (pure black)
                        if (c.R == bg.R && c.G == bg.G && c.B == bg.B && c.A == bg.A) {
                            visited[nx, ny] = true;
                            q.Enqueue(new Point(nx, ny));
                        }
                    }
                }
            }
        }
        
        // Make all connected pixels transparent
        foreach (Point p in toClear) {
            bmp.SetPixel(p.X, p.Y, Color.FromArgb(0, 0, 0, 0));
        }
        
        // Overwrite file
        bmp.Save(outputPath, System.Drawing.Imaging.ImageFormat.Png);
        bmp.Dispose();
        Console.WriteLine("Background removal completed. Saved to: " + outputPath);
    }
}
"@

# Note: We must compile under a different class name if running again in the same PowerShell process,
# or we can just run it in a new PowerShell process. Let's name the class ImageProcessorTransparent to avoid conflict.
$csharpCode = $csharpCode -replace "class ImageProcessor", "class ImageProcessorTransparent"
$csharpCode = $csharpCode -replace "\[ImageProcessor\]", "[ImageProcessorTransparent]"

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies System.Drawing

Write-Host "Removing background from assets/dorayaki.png..."
[ImageProcessorTransparent]::MakeBackgroundTransparent("assets/dorayaki.png", "assets/dorayaki.png")
Write-Host "Background removed successfully!"
