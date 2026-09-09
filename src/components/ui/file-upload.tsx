"use client";
import { PlusCircle, Trash2, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/shared/utils";

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 20,
    y: -20,
    opacity: 0.9,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const FileUpload = ({
  onChange,
  onRemove,
}: {
  onChange?: (files: File[]) => void;
  onRemove?: (file: File) => void;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange?.(newFiles);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: true,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: (error) => {
      console.log(error);
    },
  });

  return (
    <div className="w-full" {...getRootProps()}>
      <motion.div
        whileHover="animate"
        className="group/file relative block w-full cursor-default overflow-hidden rounded-2xl border border-border bg-card p-10"
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          multiple
          accept=".csv"
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
        />
        <div className="absolute inset-0 mask-[radial-gradient(ellipse_at_center,white,transparent)]">
          <GridPattern />
        </div>
        <div className="flex flex-col items-center justify-center">
          {files.length === 0 ? (
            <>
              <p className="relative z-20 font-sans text-base font-bold text-foreground">
                Charger un fichier
              </p>
              <p className="relative z-20 mt-2 font-sans text-base font-normal text-muted-foreground">
                Glissez-déposez votre fichier ici ou cliquez pour charger
              </p>
            </>
          ) : (
            <p className="relative z-20 font-sans text-sm font-medium text-muted-foreground">
              {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné
              {files.length > 1 ? "s" : ""}
            </p>
          )}
          <div className="relative mx-auto mt-10 w-full max-w-xl">
            {files.length > 0 &&
              files.map((file, idx) => (
                <motion.div
                  key={file.name + file.lastModified}
                  layoutId={idx === 0 ? "file-upload" : `file-upload-${idx}`}
                  className={cn(
                    "relative z-40 mx-auto mt-4 flex w-full flex-col items-start justify-start overflow-hidden rounded-xl border border-border bg-card p-4 md:h-24",
                    "shadow-sm",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-4">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="max-w-xs truncate text-base text-foreground"
                    >
                      {file.name}
                    </motion.p>
                    <div className="flex items-center gap-2">
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        layout
                        className="w-fit shrink-0 rounded-lg bg-indigo-500/10 px-2 py-1 text-sm font-medium text-indigo-600 dark:text-indigo-400"
                      >
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </motion.p>
                      <motion.button
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        layout
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, i) => i !== idx));
                          onRemove?.(file);
                        }}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label="Supprimer le fichier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </motion.button>
                    </div>
                  </div>

                  <div className="mt-2 flex w-full flex-col items-start justify-between text-sm text-muted-foreground md:flex-row md:items-center">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="rounded-md bg-muted px-1 py-0.5"
                    >
                      {file.name.match(/\.csv$/i)
                        ? "text/csv"
                        : file.name.match(/\.xlsx$/i)
                          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          : file.name.match(/\.xls$/i)
                            ? "application/vnd.ms-excel"
                            : file.type || "application/octet-stream"}
                    </motion.p>

                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} layout>
                      modifié {new Date(file.lastModified).toLocaleDateString()}
                    </motion.p>
                  </div>
                </motion.div>
              ))}
            {files.length > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                className="relative z-40 mx-auto mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400 bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 hover:border-indigo-600 active:scale-[0.98] transition-all duration-150"
              >
                <PlusCircle className="h-4 w-4" />
                Ajouter des fichiers
              </motion.button>
            )}
            {!files.length && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                onClick={handleClick}
                className={cn(
                  "relative z-40 mx-auto mt-4 flex h-32 w-full max-w-32 cursor-pointer items-center justify-center rounded-xl border border-border bg-card group-hover/file:shadow-xl group-hover/file:border-indigo-500/50",
                  "shadow-sm transition-all duration-200",
                )}
              >
                {isDragActive ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-1 text-indigo-500 dark:text-indigo-400"
                  >
                    Déposez
                    <Upload className="h-4 w-4" />
                  </motion.p>
                ) : (
                  <Upload className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                )}
              </motion.div>
            )}

            {!files.length && (
              <motion.div
                variants={secondaryVariant}
                className="absolute inset-0 z-30 mx-auto mt-4 flex h-32 w-full max-w-32 items-center justify-center rounded-xl border border-dashed border-indigo-500 bg-transparent opacity-0"
              ></motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

function GridPattern() {
  const columns = 41;
  const rows = 11;
  const cells = Array.from({ length: rows * columns }, (_, i) => ({
    id: i,
    even: i % 2 === 0,
  }));
  return (
    <div className="flex shrink-0 scale-105 flex-wrap items-center justify-center gap-x-px gap-y-px bg-border/30">
      {cells.map(({ id, even }) => (
        <div
          key={id}
          className={`flex h-10 w-10 shrink-0 rounded-xs ${
            even ? "bg-card" : "bg-card shadow-[0px_0px_1px_3px_hsl(var(--background))_inset]"
          }`}
        />
      ))}
    </div>
  );
}
