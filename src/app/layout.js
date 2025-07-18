import "./globals.css";

export const metadata = {
  title: "BGRemover",
  description: "Remove background from any photo in seconds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          key="font-awesome"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
          key="google-fonts"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-gradient-to-br from-[#0a0a0a] to-[#121212] font-poppins">
        {children}
      </body>
    </html>
  );
}
