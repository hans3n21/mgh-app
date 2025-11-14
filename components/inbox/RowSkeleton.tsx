"use client";
import React from 'react';

export default function RowSkeleton() {
	return (
		<div className="h-[72px] animate-pulse px-3 py-3 border-b border-slate-800">
			<div className="flex items-center gap-3 h-full">
				<div className="h-2 w-2 rounded-full bg-slate-700" />
				<div className="flex-1 space-y-2">
					<div className="h-4 w-1/3 rounded bg-slate-700" />
					<div className="h-3 w-2/3 rounded bg-slate-800" />
				</div>
				<div className="h-4 w-16 rounded bg-slate-800" />
			</div>
		</div>
	);
}


