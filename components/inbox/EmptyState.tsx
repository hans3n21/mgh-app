"use client";
import React from 'react';

type Props = {
	title: string;
	subtitle?: string;
};

export default function EmptyState({ title, subtitle }: Props) {
	return (
		<div className="flex flex-col items-center justify-center text-center py-16 px-6 text-slate-400">
			<div className="h-16 w-16 mb-4 opacity-60">
				<img src="/window.svg" alt="Empty" className="h-full w-full object-contain" />
			</div>
			<h3 className="text-slate-200 text-lg font-semibold">{title}</h3>
			{subtitle ? <p className="mt-1 text-sm">{subtitle}</p> : null}
		</div>
	);
}


